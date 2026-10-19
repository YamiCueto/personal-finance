import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalFinancialAdapter } from './local-financial.adapter';

const USER_A = 'user-a';
const USER_B = 'user-b';
const EMPTY_USER = 'empty-user-test';

describe('LocalFinancialAdapter', () => {
  let adapter: LocalFinancialAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    adapter = TestBed.inject(LocalFinancialAdapter);
    adapter.resetAll();
    adapter.seedDefaultUserData(USER_A);
    adapter.seedDefaultUserData(USER_B);
  });

  describe('LA-01: Aislamiento de cuentas entre usuarios', () => {
    it('cuenta creada para User B no aparece en la lista de User A', async () => {
      const accountsABefore = await adapter.getAccounts(USER_A);
      expect(accountsABefore.length).toBeGreaterThan(0);

      const newAccB = await adapter.createAccount(USER_B, { name: 'Cuenta Nueva Exclusiva B', type: 'CASH', initialBalance: 0 });

      const accountsAAfter = await adapter.getAccounts(USER_A);
      expect(accountsAAfter.length).toBe(accountsABefore.length);
      expect(accountsAAfter.some((a) => a.id === newAccB.id)).toBe(false);
    });
  });

  describe('LA-02: Pago con obligación de otro usuario falla', () => {
    it('User B no puede registrar pago sobre obligación de User A', async () => {
      const accA = await adapter.createAccount(USER_A, { name: 'Cuenta Unica A', type: 'CASH', initialBalance: 5000 });
      const ob = await adapter.createPeriodObligation(USER_A, {
        sourceType: 'AD_HOC_COMMITMENT',
        periodYear: new Date().getFullYear(),
        periodMonth: new Date().getMonth() + 1,
        name: 'Obligacion Unica A',
        amount: 500,
        dueDate: new Date().toISOString(),
        capitalComponent: 500,
        interestCurrentComponent: 0,
        insuranceComponent: 0,
      });

      const [accB] = await adapter.getAccounts(USER_B);
      await expect(
        adapter.recordPayment(USER_B, { obligationId: ob.id, accountId: accB.id, amount: 100 })
      ).rejects.toThrow(/no pertenece al usuario|no encontrada/i);
    });
  });

  describe('LA-03: Transferencia con cuenta de otro usuario falla', () => {
    it('User B no puede transferir usando cuenta de User A como origen', async () => {
      const uniqueAccA = await adapter.createAccount(USER_A, { name: 'Cuenta Exclusiva A', type: 'CASH', initialBalance: 1000 });
      const [accB] = await adapter.getAccounts(USER_B);

      await expect(
        adapter.recordTransfer(USER_B, {
          fromAccountId: uniqueAccA.id,
          toAccountId: accB.id,
          amount: 100,
          idempotencyKey: `test-la03-${Date.now()}`,
        })
      ).rejects.toThrow(/no existe|no pertenece/i);
    });
  });

  describe('LA-04: Idempotencia — mismo pago devuelve isReplayed: true', () => {
    it('segundo pago con misma clave devuelve isReplayed sin alterar saldo', async () => {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const obs = await adapter.getPeriodObligations(USER_A, year, month);
      const ob = obs.find((o) => o.status === 'PENDING');
      if (!ob) return;

      const [acc] = await adapter.getAccounts(USER_A);
      const balanceBefore = acc.currentBalance;
      const ikey = `idem-la04-${Date.now()}`;
      const amount = Math.min(100, ob.amountPending);

      const r1 = await adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount, idempotencyKey: ikey });
      expect(r1.isReplayed).toBe(false);

      const r2 = await adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount, idempotencyKey: ikey });
      expect(r2.isReplayed).toBe(true);
      expect(r2.operationId).toBe(r1.operationId);

      const [accAfter] = (await adapter.getAccounts(USER_A)).filter((a) => a.id === acc.id);
      expect(accAfter.currentBalance).toBe(balanceBefore - amount);
    });
  });

  describe('LA-05: Conflicto de idempotencia con parámetros distintos lanza error', () => {
    it('reutilizar clave con amount diferente falla', async () => {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const obs = await adapter.getPeriodObligations(USER_A, year, month);
      const ob = obs.find((o) => o.amountPending >= 200);
      if (!ob) return;

      const [acc] = await adapter.getAccounts(USER_A);
      const ikey = `idem-la05-${Date.now()}`;
      await adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount: 100, idempotencyKey: ikey });

      await expect(
        adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount: 200, idempotencyKey: ikey })
      ).rejects.toThrow(/conflicto de idempotencia/i);
    });
  });

  describe('LA-06: Generación idempotente de cuota de crédito', () => {
    it('generar cuota dos veces para mismo producto y período devuelve la misma obligación', async () => {
      const [credit] = await adapter.getCreditProducts(USER_A);
      const year = new Date().getFullYear();
      const month = (new Date().getMonth() % 12) + 1;

      const ob1 = await adapter.generateCreditInstallmentObligation(USER_A, { creditProductId: credit.id, periodYear: year, periodMonth: month });
      const ob2 = await adapter.generateCreditInstallmentObligation(USER_A, { creditProductId: credit.id, periodYear: year, periodMonth: month });

      expect(ob1.id).toBe(ob2.id);
    });
  });

  describe('LA-07: Sobrepago rechazado', () => {
    it('pago superior al saldo pendiente lanza error', async () => {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const obs = await adapter.getPeriodObligations(USER_A, year, month);
      const ob = obs.find((o) => o.status === 'PENDING');
      if (!ob) return;

      const [acc] = await adapter.getAccounts(USER_A);
      await expect(
        adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount: ob.amountPending + 1 })
      ).rejects.toThrow(/sobrepago/i);
    });
  });

  describe('LA-08: Pago sobre obligación PAID rechazado', () => {
    it('pagar obligación ya cancelada lanza error', async () => {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const obs = await adapter.getPeriodObligations(USER_A, year, month);
      const ob = obs.find((o) => o.status === 'PENDING' && o.amountPending > 0);
      if (!ob) return;

      const [acc] = await adapter.getAccounts(USER_A);
      await adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount: ob.amountPending });

      await expect(
        adapter.recordPayment(USER_A, { obligationId: ob.id, accountId: acc.id, amount: 1 })
      ).rejects.toThrow(/totalmente cancelada/i);
    });
  });

  describe('LA-09: Reset restaura datos semilla', () => {
    it('tras resetUserScenario getAccounts devuelve datos de semilla', async () => {
      const accsBefore = await adapter.getAccounts(USER_A);
      await adapter.createAccount(USER_A, { name: 'Cuenta Temporal', type: 'CASH', initialBalance: 0 });
      const accsMiddle = await adapter.getAccounts(USER_A);
      expect(accsMiddle.length).toBeGreaterThan(accsBefore.length);

      adapter.resetUserScenario(USER_A);
      const accsAfter = await adapter.getAccounts(USER_A);
      expect(accsAfter.length).toBe(accsBefore.length);
    });
  });

  describe('LA-10: empty- prefijo no recibe datos semilla', () => {
    it('usuario con prefijo empty- devuelve listas vacías', async () => {
      const accs = await adapter.getAccounts(EMPTY_USER);
      expect(accs.length).toBe(0);
    });
  });
});
