import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Seguimiento y eliminación segura en PostgreSQL aislado', () => {
  let db: PGlite;
  const user = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  let account: string;
  let institution: string;
  let product: string;
  let obligation: string;
  let payment: string;
  const scalar = async (sql: string, values: unknown[] = []) => (await db.query<any>(sql, values)).rows[0];
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    for (const file of readdirSync(resolve('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(resolve('supabase/migrations', file), 'utf8'));
    await db.exec(`INSERT INTO auth.users VALUES ('${user}'),('${other}'); SELECT set_config('request.jwt.claim.sub','${user}',false);`);
    institution = (await scalar(`INSERT INTO public.institutions(user_id,name,type) VALUES ($1,'Entidad de prueba','BANK') RETURNING id`, [user])).id;
    account = (await scalar(`INSERT INTO public.accounts(user_id,name,type,initial_balance,current_balance) VALUES ($1,'Cuenta de prueba','SAVINGS',2000000,2000000) RETURNING id`, [user])).id;
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('elimina cuenta sin historial, crea auditoría de eliminación con identidad autenticada y rechaza usuario ajeno', async () => {
    const id = (await scalar(`INSERT INTO public.accounts(user_id,name,type,institution_id) VALUES ($1,'Error','CASH',$2) RETURNING id`, [user, institution])).id;
    await expect(db.query('SELECT public.delete_financial_account($1,$2)', [other,id])).rejects.toThrow(/autorizada/);
    const opId = '11111111-2222-4333-8444-555555555555';
    await db.exec('SET ROLE authenticated');
    await db.query('SELECT public.delete_financial_account($1,$2,$3,$4::uuid)', [user,id,'Cuenta creada por error',opId]);
    const audit = await scalar('SELECT * FROM public.financial_account_deletion_audit WHERE account_id=$1',[id]);
    expect(audit).toBeDefined();
    expect(audit.account_name).toBe('Error');
    expect(audit.account_type).toBe('CASH');
    expect(audit.institution_id).toBe(institution);
    expect(audit.owner_user_id).toBe(user);
    expect(audit.deleted_by).toBe(user);
    expect(audit.deletion_reason).toBe('Cuenta creada por error');
    expect(audit.operation_id).toBe(opId);
    expect(audit.metadata.rpc).toBe('delete_financial_account');
    expect(audit.metadata.operation_type).toBe('ACCOUNT_DELETED');
    expect(audit.metadata.result).toBe('SUCCESS');
    expect(audit.metadata.verified_origin).toBe('No disponible');
    const logRow = await scalar(`SELECT * FROM public.financial_audit_log WHERE event_type='ACCOUNT_DELETED' AND payload->>'account_id'=$1`,[id]);
    expect(logRow).toBeDefined();
    expect(logRow.user_id).toBe(user);
    await db.exec('RESET ROLE');
    expect((await scalar('SELECT count(*)::int AS n FROM public.accounts WHERE id=$1',[id])).n).toBe(0);
  });

  it('registra saldo de corte sin desembolso original ni pagos inventados; idempotencia', async () => {
    const input = { institutionId: institution, name: 'Vehículo de prueba', type: 'VEHICLE_LOAN', obligationKind: 'FINANCED_DEBT', openingPrincipalBalance: 18000000, trackingStartDate: '2026-10-24', nextDueDate: '2026-11-15', agreedInstallment: 750000, remainingInstallments: 24, knownInterestMonthly: 150000, insuranceMonthly: 30000, feesMonthly: 0, idempotencyKey: 'registration' };
    await db.exec('SET ROLE authenticated');
    const row = await scalar('SELECT (public.register_existing_debt($1,$2)).*',[user,JSON.stringify(input)]);
    product = row.id;
    expect(row.original_principal).toBeNull();
    expect(row.nominal_rate_monthly).toBeNull();
    expect(Number(row.current_principal_balance)).toBe(18000000);
    expect((await scalar('SELECT (public.register_existing_debt($1,$2)).id',[user,JSON.stringify(input)])).id).toBe(product);
    await expect(db.query('SELECT public.register_existing_debt($1,$2)',[user,JSON.stringify({...input,openingPrincipalBalance: 1})])).rejects.toThrow(/idempotencia/);
    expect((await scalar('SELECT count(*)::int AS n FROM public.obligation_payments')).n).toBe(0);
    await db.exec('RESET ROLE');
  });

  it('genera cuota única desde el vencimiento y rechaza meses sin historia', async () => {
    await expect(db.query('SELECT public.generate_tracked_installment($1,$2,2026,9)',[user,product])).rejects.toThrow(/Sin historial/);
    const row = await scalar('SELECT (public.generate_tracked_installment($1,$2,2026,11)).*',[user,product]);
    obligation = row.id;
    expect(Number(row.capital_component)).toBe(570000);
    expect((await scalar('SELECT (public.generate_tracked_installment($1,$2,2026,11)).id',[user,product])).id).toBe(obligation);
  });

  it('paga en dos abonos sin cobrar dos veces interés o seguro; conserva referencia y fecha', async () => {
    const first = await scalar(`SELECT public.record_obligation_payment($1,$2,$3,200000,'PARTIAL_PAYMENT','pay-1',NULL,NULL,NULL,NULL,'ref-1',NULL,'2026-11-15') AS result`,[user,obligation,account]);
    payment = first.result.payment_id;
    const replay = await scalar(`SELECT public.record_obligation_payment($1,$2,$3,200000,'PARTIAL_PAYMENT','pay-1',NULL,NULL,NULL,NULL,'ref-1',NULL,'2026-11-15') AS result`,[user,obligation,account]);
    expect(replay.result.is_replayed).toBe(true);
    await scalar(`SELECT public.record_obligation_payment($1,$2,$3,550000,'REGULAR_INSTALLMENT','pay-2',NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-16')`,[user,obligation,account]);
    expect(Number((await scalar('SELECT current_principal_balance FROM public.credit_products WHERE id=$1',[product])).current_principal_balance)).toBe(17430000);
    expect(Number((await scalar('SELECT sum(applied_to_interest) AS total FROM public.obligation_payments')).total)).toBe(150000);
    await expect(db.query('SELECT public.delete_financial_account($1,$2)',[user,account])).rejects.toThrow(/historial financiero/);
  });

  it('conciliación auditable y aislamiento RLS real por rol', async () => {
    const input = { creditProductId: product, statementDate: '2026-11-30', reportedBalance: 17440000, expectedBalance: 17430000, reason: 'Extracto confirmado', idempotencyKey: 'recon-1' };
    const row = await scalar('SELECT (public.reconcile_debt($1,$2)).*',[user,JSON.stringify(input)]);
    expect(Number(row.difference)).toBe(10000);
    await expect(db.query('UPDATE public.debt_reconciliations SET reason=$1 WHERE id=$2',['cambio',row.id])).rejects.toThrow(/inmutables/);
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${other}',false);`);
    expect((await scalar('SELECT count(*)::int AS n FROM public.debt_reconciliations')).n).toBe(0);
    await expect(db.query('SELECT public.delete_financial_account($1,$2)',[other,account])).rejects.toThrow(/no pertenece/);
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  });

  it('abono extraordinario y reverso no aumentan la cuota exigible; archiva cuenta con auditoría sin duplicar eventos y conserva historial', async () => {
    const before = await scalar('SELECT amount_pending FROM public.period_obligations WHERE id=$1',[obligation]);
    const extra = await scalar(`SELECT public.record_obligation_payment($1,$2,$3,100000,'PREPAYMENT_CAPITAL','extra',NULL,NULL,NULL,NULL,NULL,NULL,'2026-12-01') AS result`,[user,obligation,account]);
    await db.query(`SELECT public.reverse_operation($1,'PAYMENT',$2,'Corrección')`,[user,extra.result.payment_id]);
    expect((await scalar('SELECT amount_pending FROM public.period_obligations WHERE id=$1',[obligation])).amount_pending).toBe(before.amount_pending);
    await expect(db.query('SELECT public.delete_financial_account($1,$2)',[user,account])).rejects.toThrow(/historial financiero/);
    await db.exec('SET ROLE authenticated');
    await expect(db.query('UPDATE public.accounts SET is_archived=true WHERE id=$1',[account])).rejects.toThrow(/permission denied/);
    const archived = await scalar('SELECT public.archive_financial_account($1,$2,$3) AS res',[user,account,'arch-1']);
    expect(archived.res.is_archived).toBe(true);
    await scalar('SELECT public.archive_financial_account($1,$2,$3) AS res',[user,account,'arch-2']);
    expect((await scalar(`SELECT count(*)::int AS n FROM public.financial_audit_log WHERE event_type='ACCOUNT_ARCHIVED' AND payload->>'account_id'=$1`,[account])).n).toBe(1);
    await db.exec('RESET ROLE');
    expect((await scalar('SELECT count(*)::int AS n FROM public.obligation_payments WHERE account_id=$1',[account])).n).toBe(3);
  });

  it('protege ingresos revertidos y las dos cuentas de una transferencia', async () => {
    const a = (await scalar(`INSERT INTO public.accounts(user_id,name,type,initial_balance,current_balance) VALUES ($1,'Origen','CASH',100,100) RETURNING id`,[user])).id;
    const b = (await scalar(`INSERT INTO public.accounts(user_id,name,type,initial_balance,current_balance) VALUES ($1,'Destino','CASH',0,0) RETURNING id`,[user])).id;
    const income = await scalar(`SELECT public.record_income($1,$2,2026,10::smallint,'Ingreso de prueba',100,'2026-10-24','income-test',NULL) AS result`,[user,b]);
    await db.query(`SELECT public.reverse_operation($1,'INCOME',$2,'Corrección')`,[user,income.result.income_id]);
    await expect(db.query('SELECT public.delete_financial_account($1,$2)',[user,b])).rejects.toThrow(/historial financiero/);
    await db.query(`SELECT public.record_internal_transfer($1,$2,$3,50,0,'transfer-test',NULL)`,[user,a,b]);
    for (const id of [a,b]) await expect(db.query('SELECT public.delete_financial_account($1,$2)',[user,id])).rejects.toThrow(/historial financiero/);
    expect(Number((await scalar('SELECT current_balance FROM public.accounts WHERE id=$1',[a])).current_balance)).toBe(50);
  });

  it('deniega llamadas sin sesión y lectura de pagos ajenos', async () => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${other}',false);`);
    expect((await scalar('SELECT count(*)::int AS n FROM public.obligation_payments')).n).toBe(0);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','',false);`);
    await expect(db.query('SELECT public.delete_financial_account($1,$2)',[user,account])).rejects.toThrow(/autorizada/);
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  });

  it('aplica FORCE ROW LEVEL SECURITY en debt_reconciliations y bloquea ingresos o transferencias en cuentas archivadas', async () => {
    const rls = await scalar(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.debt_reconciliations'::regclass`);
    expect(rls.relrowsecurity).toBe(true);
    expect(rls.relforcerowsecurity).toBe(true);
    const activeAcc = (await scalar(`INSERT INTO public.accounts(user_id,name,type,initial_balance,current_balance) VALUES ($1,'Activa','SAVINGS',500,500) RETURNING id`,[user])).id;
    await expect(db.query(`SELECT public.record_income($1,$2,2026,11::smallint,'Ingreso bloqueado',100,'2026-11-10','inc-arch',NULL)`,[user,account])).rejects.toThrow(/archivada/);
    await expect(db.query(`SELECT public.record_internal_transfer($1,$2,$3,50,0,'tx-arch-from',NULL)`,[user,account,activeAcc])).rejects.toThrow(/archivada/);
    await expect(db.query(`SELECT public.record_internal_transfer($1,$2,$3,50,0,'tx-arch-to',NULL)`,[user,activeAcc,account])).rejects.toThrow(/archivada/);
  });

  it('restaura cuenta archivada preservando su identidad e historial y registra ACCOUNT_RESTORED sin duplicados', async () => {
    await db.exec('SET ROLE authenticated');
    const restored = await scalar('SELECT public.restore_financial_account($1,$2,$3) AS res',[user,account,'rest-1']);
    expect(restored.res.account_id).toBe(account);
    expect(restored.res.is_archived).toBe(false);
    await scalar('SELECT public.restore_financial_account($1,$2,$3) AS res',[user,account,'rest-2']);
    expect((await scalar(`SELECT count(*)::int AS n FROM public.financial_audit_log WHERE event_type='ACCOUNT_RESTORED' AND payload->>'account_id'=$1`,[account])).n).toBe(1);
    const rearchived = await scalar('SELECT public.archive_financial_account($1,$2,$3) AS res',[user,account,'arch-again']);
    expect(rearchived.res.is_archived).toBe(true);
    await db.exec('RESET ROLE');
  });

  it('impide modificar o eliminar eventos de auditoría desde el cliente o funciones y aplica FORCE RLS en auditoría', async () => {
    const rlsDel = await scalar(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.financial_account_deletion_audit'::regclass`);
    expect(rlsDel.relrowsecurity).toBe(true);
    expect(rlsDel.relforcerowsecurity).toBe(true);
    const rlsLog = await scalar(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.financial_audit_log'::regclass`);
    expect(rlsLog.relrowsecurity).toBe(true);
    expect(rlsLog.relforcerowsecurity).toBe(true);
    await db.exec('SET ROLE authenticated');
    await expect(db.query(`INSERT INTO public.financial_account_deletion_audit(account_id,account_name,account_type,owner_user_id,deleted_by,operation_id) VALUES (gen_random_uuid(),'Fake','CASH',$1,$1,gen_random_uuid())`,[user])).rejects.toThrow();
    await expect(db.query(`UPDATE public.financial_account_deletion_audit SET deletion_reason='Alterado'`)).rejects.toThrow();
    await expect(db.query(`DELETE FROM public.financial_account_deletion_audit`)).rejects.toThrow();
    await expect(db.query(`UPDATE public.financial_audit_log SET event_type='HACK'`)).rejects.toThrow();
    await expect(db.query(`DELETE FROM public.financial_audit_log`)).rejects.toThrow();
    await db.exec('RESET ROLE');
    await expect(db.query(`UPDATE public.financial_account_deletion_audit SET deletion_reason='Alterado'`)).rejects.toThrow(/inmutables/);
    await expect(db.query(`DELETE FROM public.financial_account_deletion_audit`)).rejects.toThrow(/inmutables/);
    await expect(db.query(`UPDATE public.financial_audit_log SET event_type='HACK'`)).rejects.toThrow(/inmutables/);
    await expect(db.query(`DELETE FROM public.financial_audit_log`)).rejects.toThrow(/inmutables/);
  });

  it('ejecuta rollback completo si falla el registro de auditoría o si falla la eliminación de la cuenta', async () => {
    const accAuditFail = (await scalar(`INSERT INTO public.accounts(user_id,name,type) VALUES ($1,'Fallo Auditoria','CASH') RETURNING id`,[user])).id;
    const dupOpId = '11111111-2222-4333-8444-555555555555';
    await db.exec('SET ROLE authenticated');
    await expect(db.query('SELECT public.delete_financial_account($1,$2,$3,$4::uuid)',[user,accAuditFail,'Operación duplicada',dupOpId])).rejects.toThrow();
    await db.exec('RESET ROLE');
    expect((await scalar('SELECT count(*)::int AS n FROM public.accounts WHERE id=$1',[accAuditFail])).n).toBe(1);

    const accDeleteFail = (await scalar(`INSERT INTO public.accounts(user_id,name,type) VALUES ($1,'Fallo Borrado','CASH') RETURNING id`,[user])).id;
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.simulate_delete_failure()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.name = 'Fallo Borrado' THEN
          RAISE EXCEPTION 'Fallo simulado al eliminar fila de cuenta';
        END IF;
        RETURN OLD;
      END;
      $$;
      CREATE TRIGGER zzz_simulate_delete_failure
      BEFORE DELETE ON public.accounts
      FOR EACH ROW EXECUTE FUNCTION public.simulate_delete_failure();
    `);
    await db.exec('SET ROLE authenticated');
    await expect(db.query('SELECT public.delete_financial_account($1,$2,$3)',[user,accDeleteFail,'Prueba rollback borrado'])).rejects.toThrow(/Fallo simulado/);
    await db.exec('RESET ROLE');
    expect((await scalar('SELECT count(*)::int AS n FROM public.accounts WHERE id=$1',[accDeleteFail])).n).toBe(1);
    expect((await scalar('SELECT count(*)::int AS n FROM public.financial_account_deletion_audit WHERE account_id=$1',[accDeleteFail])).n).toBe(0);
    expect((await scalar(`SELECT count(*)::int AS n FROM public.financial_audit_log WHERE event_type='ACCOUNT_DELETED' AND payload->>'account_id'=$1`,[accDeleteFail])).n).toBe(0);
    await db.exec('DROP TRIGGER zzz_simulate_delete_failure ON public.accounts; DROP FUNCTION public.simulate_delete_failure();');
  });
});
