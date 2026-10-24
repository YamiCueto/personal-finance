import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseFinancialAdapter } from '../../src/app/core/repositories/supabase-financial.adapter';
import { SupabaseService } from '../../src/app/core/services/supabase.service';

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54421';
const LOCAL_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const ALICE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ALICE_EMAIL = 'alice@localtest.dev';
const ALICE_PASS = 'Test1234!';
const BOB_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const BOB_EMAIL = 'bob@localtest.dev';
const BOB_PASS = 'Test1234!';

function runPsql(sql: string): string {
  return execSync(
    `docker exec -i supabase_db_personal-finance psql -U postgres -d postgres -t -A`,
    { input: sql, encoding: 'utf8' }
  ).trim();
}

describe('Integración Real: Angular SupabaseFinancialAdapter -> PostgREST/RPC -> PostgreSQL 17 Local', () => {
  let aliceClient: SupabaseClient;
  let bobClient: SupabaseClient;
  let aliceInjector: EnvironmentInjector;
  let bobInjector: EnvironmentInjector;
  let aliceAdapter: SupabaseFinancialAdapter;
  let bobAdapter: SupabaseFinancialAdapter;
  const runTag = `INT-${Date.now()}`;
  const createdAccountIds: string[] = [];
  const createdInstitutionIds: string[] = [];
  const createdCreditIds: string[] = [];
  const createdOperationIds: string[] = [];

  beforeAll(async () => {
    expect(LOCAL_SUPABASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:54421$/);

    aliceClient = createClient(LOCAL_SUPABASE_URL, LOCAL_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    bobClient = createClient(LOCAL_SUPABASE_URL, LOCAL_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const aliceAuth = await aliceClient.auth.signInWithPassword({
      email: ALICE_EMAIL,
      password: ALICE_PASS,
    });
    expect(aliceAuth.error).toBeNull();
    expect(aliceAuth.data.user?.id).toBe(ALICE_ID);

    const bobAuth = await bobClient.auth.signInWithPassword({
      email: BOB_EMAIL,
      password: BOB_PASS,
    });
    expect(bobAuth.error).toBeNull();
    expect(bobAuth.data.user?.id).toBe(BOB_ID);

    aliceInjector = createEnvironmentInjector(
      [
        SupabaseFinancialAdapter,
        { provide: SupabaseService, useValue: { clientInstance: aliceClient } },
      ],
      null as unknown as EnvironmentInjector
    );
    aliceAdapter = aliceInjector.get(SupabaseFinancialAdapter);

    bobInjector = createEnvironmentInjector(
      [
        SupabaseFinancialAdapter,
        { provide: SupabaseService, useValue: { clientInstance: bobClient } },
      ],
      null as unknown as EnvironmentInjector
    );
    bobAdapter = bobInjector.get(SupabaseFinancialAdapter);
  }, 30000);

  afterAll(async () => {
    aliceInjector?.destroy();
    bobInjector?.destroy();
    if (aliceClient) await aliceClient.auth.signOut();
    if (bobClient) await bobClient.auth.signOut();
  });

  it('1 y 2. verifica migraciones aplicadas y creación de tablas de auditoría con RLS y FORCE RLS en PostgreSQL 17 real', () => {
    const migrationsRaw = runPsql(
      `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261015000001','20261015000002','20261015000003','20261018000004','20261018000005','20261018000006','20261024161622','20261024180000');`
    );
    expect(Number(migrationsRaw)).toBe(8);

    const rlsRaw = runPsql(
      `SELECT relname || ':' || relrowsecurity || ':' || relforcerowsecurity FROM pg_class WHERE relname IN ('accounts','debt_reconciliations','financial_account_deletion_audit','financial_audit_log') ORDER BY relname;`
    );
    expect(rlsRaw.split('\n').map(s => s.trim())).toEqual([
      'accounts:true:true',
      'debt_reconciliations:true:true',
      'financial_account_deletion_audit:true:true',
      'financial_audit_log:true:true',
    ]);
  });

  it('3, 4, 5 y 9. elimina definitivamente cuenta sin movimientos vía PostgREST RPC y persiste evento en financial_account_deletion_audit y financial_audit_log', async () => {
    const inst = await aliceAdapter.createInstitution(ALICE_ID, `Banco Real ${runTag}`, 'BANK');
    createdInstitutionIds.push(inst.id);

    const acc = await aliceAdapter.createAccount(ALICE_ID, {
      institutionId: inst.id,
      name: `Cuenta Efímera ${runTag}`,
      type: 'SAVINGS',
      initialBalance: 350000,
    });
    expect(acc.currentBalance).toBe(350000);
    expect(typeof acc.currentBalance).toBe('number');

    const opId = crypto.randomUUID();
    createdOperationIds.push(opId);

    await aliceAdapter.deleteAccount(ALICE_ID, acc.id, {
      reason: `Eliminación de prueba real ${runTag}`,
      operationId: opId,
    });

    const afterAcc = await aliceAdapter.getAccountById(ALICE_ID, acc.id);
    expect(afterAcc).toBeNull();

    const audits = await aliceAdapter.getAccountDeletionAudit(ALICE_ID);
    const entry = audits.find(a => a.accountId === acc.id);
    expect(entry).toBeDefined();
    expect(entry!.accountName).toBe(`Cuenta Efímera ${runTag}`);
    expect(entry!.accountType).toBe('SAVINGS');
    expect(entry!.institutionId).toBe(inst.id);
    expect(entry!.ownerUserId).toBe(ALICE_ID);
    expect(entry!.deletedBy).toBe(ALICE_ID);
    expect(entry!.deletionReason).toBe(`Eliminación de prueba real ${runTag}`);
    expect(entry!.operationId).toBe(opId);
    expect(entry!.metadata['rpc']).toBe('delete_financial_account');
    expect(entry!.metadata['operation_type']).toBe('ACCOUNT_DELETED');
    expect(entry!.metadata['result']).toBe('SUCCESS');
    expect(entry!.deletedAt).toBeTruthy();

    const trail = await aliceAdapter.getAccountAuditTrail(ALICE_ID, acc.id);
    const delEvt = trail.find(e => e.eventType === 'ACCOUNT_DELETED');
    expect(delEvt).toBeDefined();
    expect(delEvt!.userId).toBe(ALICE_ID);
  });

  it('6, 7, 8 y 13. bloquea eliminación con historial, archiva independientemente, bloquea operaciones en archivada, consulta historial, restaura y normaliza importes de PostgREST', async () => {
    const inst = await aliceAdapter.createInstitution(ALICE_ID, `Entidad Crédito ${runTag}`, 'BANK');
    createdInstitutionIds.push(inst.id);

    const acc = await aliceAdapter.createAccount(ALICE_ID, {
      institutionId: inst.id,
      name: `Cuenta Operativa ${runTag}`,
      type: 'CHECKING',
      initialBalance: 2500000.75,
    });
    createdAccountIds.push(acc.id);
    expect(acc.currentBalance).toBe(2500000.75);
    expect(typeof acc.currentBalance).toBe('number');

    const incRes = await aliceAdapter.recordIncome(ALICE_ID, {
      accountId: acc.id,
      sourceName: `Honorarios ${runTag}`,
      amount: 500000.25,
      periodYear: 2026,
      periodMonth: 10,
      receivedDate: '2026-10-20',
      idempotencyKey: `inc-${runTag}`,
    });
    expect(incRes.success).toBe(true);

    const debt = await aliceAdapter.registerExistingDebt(ALICE_ID, {
      institutionId: inst.id,
      name: `Deuda Real ${runTag}`,
      type: 'PERSONAL_LOAN',
      obligationKind: 'FINANCED_DEBT',
      openingPrincipalBalance: 10000000,
      trackingStartDate: '2026-10-24',
      nextDueDate: '2026-11-15',
      agreedInstallment: 600000,
      remainingInstallments: 18,
      knownInterestMonthly: 120000,
      insuranceMonthly: 20000,
      feesMonthly: 0,
      idempotencyKey: `debt-${runTag}`,
    });
    createdCreditIds.push(debt.id);
    expect(typeof debt.currentPrincipalBalance).toBe('number');
    expect(debt.currentPrincipalBalance).toBe(10000000);

    const ob = await aliceAdapter.generateCreditInstallmentObligation(ALICE_ID, {
      creditProductId: debt.id,
      periodYear: 2026,
      periodMonth: 11,
    });

    const payRes = await aliceAdapter.recordPayment(ALICE_ID, {
      obligationId: ob.id,
      accountId: acc.id,
      amount: 200000,
      paymentType: 'PARTIAL_PAYMENT',
      paymentDate: '2026-11-15',
      referenceNumber: `REF-${runTag}`,
      idempotencyKey: `pay-${runTag}`,
    });
    expect(payRes.success).toBe(true);

    const debtHist = await aliceAdapter.getDebtHistory(ALICE_ID, debt.id);
    expect(debtHist.payments).toHaveLength(1);
    expect(typeof debtHist.payments[0].amount).toBe('number');
    expect(debtHist.payments[0].amount).toBe(200000);
    expect(debtHist.payments[0].appliedToInterest).toBe(120000);
    expect(debtHist.payments[0].appliedToInsurance).toBe(20000);
    expect(debtHist.payments[0].appliedToCapital).toBe(60000);

    await expect(
      aliceAdapter.deleteAccount(ALICE_ID, acc.id, { reason: 'Intento con historial' })
    ).rejects.toThrow(/historial financiero/);

    const stillActive = await aliceAdapter.getAccountById(ALICE_ID, acc.id);
    expect(stillActive?.isArchived).toBe(false);

    await aliceAdapter.archiveAccount(ALICE_ID, acc.id, `arch-1-${runTag}`);
    await aliceAdapter.archiveAccount(ALICE_ID, acc.id, `arch-2-${runTag}`);

    const afterArchive = await aliceAdapter.getAccountById(ALICE_ID, acc.id);
    expect(afterArchive?.isArchived).toBe(true);

    await expect(
      aliceAdapter.recordIncome(ALICE_ID, {
        accountId: acc.id,
        sourceName: 'Bloqueado',
        amount: 10000,
        periodYear: 2026,
        periodMonth: 11,
      })
    ).rejects.toThrow(/archivada/);

    const hist = await aliceAdapter.getAccountHistory(ALICE_ID, acc.id);
    expect(hist.incomes).toHaveLength(1);
    expect(hist.payments).toHaveLength(1);
    expect(hist.auditTrail.filter(e => e.eventType === 'ACCOUNT_ARCHIVED')).toHaveLength(1);

    await aliceAdapter.restoreAccount(ALICE_ID, acc.id, `rest-1-${runTag}`);
    await aliceAdapter.restoreAccount(ALICE_ID, acc.id, `rest-2-${runTag}`);

    const afterRestore = await aliceAdapter.getAccountById(ALICE_ID, acc.id);
    expect(afterRestore?.id).toBe(acc.id);
    expect(afterRestore?.isArchived).toBe(false);

    const histAfterRestore = await aliceAdapter.getAccountHistory(ALICE_ID, acc.id);
    expect(histAfterRestore.auditTrail.filter(e => e.eventType === 'ACCOUNT_RESTORED')).toHaveLength(1);
  });

  it('10, 11 y 12. garantiza aislamiento entre usuarios (Alice vs Bob), protección contra mutación de auditoría y rollback transaccional completo en PostgreSQL real', async () => {
    const aliceAcc = await aliceAdapter.createAccount(ALICE_ID, {
      name: `Cuenta Privada Alice ${runTag}`,
      type: 'CASH',
      initialBalance: 90000,
    });
    createdAccountIds.push(aliceAcc.id);

    const bobAccounts = await bobAdapter.getAccounts(BOB_ID);
    expect(bobAccounts.some(a => a.id === aliceAcc.id)).toBe(false);

    await expect(
      bobAdapter.deleteAccount(BOB_ID, aliceAcc.id, { reason: 'Ataque cruzado Bob' })
    ).rejects.toThrow(/no pertenece/);

    await expect(
      bobClient.rpc('delete_financial_account', {
        p_user_id: ALICE_ID,
        p_account_id: aliceAcc.id,
      })
    ).resolves.toMatchObject({
      error: expect.objectContaining({ message: expect.stringMatching(/autorizada/) }),
    });

    const bobAuditView = await bobAdapter.getAccountDeletionAudit(BOB_ID);
    expect(bobAuditView.some(a => a.ownerUserId === ALICE_ID)).toBe(false);

    const directInsertAudit = await aliceClient
      .from('financial_account_deletion_audit')
      .insert({
        account_id: aliceAcc.id,
        account_name: 'Falsa',
        account_type: 'CASH',
        owner_user_id: ALICE_ID,
        deleted_by: ALICE_ID,
        operation_id: crypto.randomUUID(),
      });
    expect(directInsertAudit.error).not.toBeNull();

    const directUpdateArchive = await aliceClient
      .from('accounts')
      .update({ is_archived: true })
      .eq('id', aliceAcc.id);
    expect(directUpdateArchive.error).not.toBeNull();

    const directDeleteAccount = await aliceClient
      .from('accounts')
      .delete()
      .eq('id', aliceAcc.id);
    expect(directDeleteAccount.error).not.toBeNull();

    const existingOpId = createdOperationIds[0];
    await expect(
      aliceAdapter.deleteAccount(ALICE_ID, aliceAcc.id, {
        reason: 'Colisión de operation_id para forzar fallo en auditoría',
        operationId: existingOpId,
      })
    ).rejects.toThrow();

    const stillExistsAfterAuditFail = await aliceAdapter.getAccountById(ALICE_ID, aliceAcc.id);
    expect(stillExistsAfterAuditFail).not.toBeNull();

    runPsql(`
      CREATE OR REPLACE FUNCTION public.tmp_simulate_real_delete_failure()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.id = '${aliceAcc.id}'::uuid THEN
          RAISE EXCEPTION 'Fallo simulado posterior a inserción de auditoría en PostgreSQL 17';
        END IF;
        RETURN OLD;
      END;
      $$;
      DROP TRIGGER IF EXISTS zzz_tmp_simulate_real_delete_failure ON public.accounts;
      CREATE TRIGGER zzz_tmp_simulate_real_delete_failure
      BEFORE DELETE ON public.accounts
      FOR EACH ROW EXECUTE FUNCTION public.tmp_simulate_real_delete_failure();
    `);

    try {
      await expect(
        aliceAdapter.deleteAccount(ALICE_ID, aliceAcc.id, {
          reason: 'Prueba rollback tras fallo de DELETE',
          operationId: crypto.randomUUID(),
        })
      ).rejects.toThrow(/Fallo simulado posterior a inserción de auditoría/);
    } finally {
      runPsql(`
        DROP TRIGGER IF EXISTS zzz_tmp_simulate_real_delete_failure ON public.accounts;
        DROP FUNCTION IF EXISTS public.tmp_simulate_real_delete_failure();
      `);
    }

    const stillExistsAfterDeleteFail = await aliceAdapter.getAccountById(ALICE_ID, aliceAcc.id);
    expect(stillExistsAfterDeleteFail).not.toBeNull();

    const auditsForRollbackAcc = await aliceAdapter.getAccountDeletionAudit(ALICE_ID);
    expect(auditsForRollbackAcc.some(a => a.accountId === aliceAcc.id)).toBe(false);

    const trailForRollbackAcc = await aliceAdapter.getAccountAuditTrail(ALICE_ID, aliceAcc.id);
    expect(trailForRollbackAcc.some(e => e.eventType === 'ACCOUNT_DELETED')).toBe(false);

    await aliceAdapter.deleteAccount(ALICE_ID, aliceAcc.id, {
      reason: 'Limpieza controlada de cuenta sin movimientos',
      operationId: crypto.randomUUID(),
    });
    expect(await aliceAdapter.getAccountById(ALICE_ID, aliceAcc.id)).toBeNull();
  });
});
