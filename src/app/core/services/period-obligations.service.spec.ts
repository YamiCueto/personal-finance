import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { PeriodObligationsService } from './period-obligations.service';
import { LocalFinancialAdapter } from '../repositories/local-financial.adapter';
import {
  PERIOD_OBLIGATION_REPOSITORY,
} from '../repositories/financial-repositories.contract';
import { AuthService } from './auth.service';
import { FINANCIAL_CONFIG, DEFAULT_FINANCIAL_CONFIG } from '../config/financial.config';

const MOCK_USER_ID = 'test-monetary-user';

function makeMockAuthService(userId: string | null): Partial<AuthService> {
  return {
    currentUser: signal(userId ? ({ id: userId } as any) : null) as any,
    isInitialized: signal(true) as any,
    isAuthenticated: signal(!!userId) as any,
    waitForInitialization: () => Promise.resolve(),
  };
}

describe('PeriodObligationsService — Integridad Monetaria COP', () => {
  let service: PeriodObligationsService;
  let adapter: LocalFinancialAdapter;

  beforeEach(() => {
    adapter = new LocalFinancialAdapter();
    adapter.resetAll();
    adapter.seedDefaultUserData(MOCK_USER_ID);

    TestBed.configureTestingModule({
      providers: [
        PeriodObligationsService,
        { provide: PERIOD_OBLIGATION_REPOSITORY, useValue: adapter },
        { provide: AuthService, useValue: makeMockAuthService(MOCK_USER_ID) },
        { provide: FINANCIAL_CONFIG, useValue: DEFAULT_FINANCIAL_CONFIG },
      ],
    });

    service = TestBed.inject(PeriodObligationsService);
  });

  function currentPeriod(): { year: number; month: number } {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  describe('MI-01: amount_paid + amount_pending = amount tras pago parcial', () => {
    it('mantiene la invariante contable después de un pago parcial', async () => {
      const { year, month } = currentPeriod();
      const obs = await service.getPeriodObligations(year, month);
      const ob = obs.find((o) => o.status === 'PENDING' && o.amountPending >= 200);
      if (!ob) return;

      const accs = await adapter.getAccounts(MOCK_USER_ID);
      const acc = accs.find((a) => a.currentBalance >= 100);
      if (!acc) return;

      await service.recordPayment({ obligationId: ob.id, accountId: acc.id, amount: 100 });

      const updated = await adapter.getObligationById(MOCK_USER_ID, ob.id);
      expect(updated).not.toBeNull();
      const sum = updated!.amountPaid + updated!.amountPending;
      expect(Math.abs(sum - updated!.amount)).toBeLessThan(0.01);
    });
  });

  describe('MI-02: Pago total marca status PAID y amountPending = 0', () => {
    it('pago completo actualiza estado correctamente', async () => {
      const { year, month } = currentPeriod();
      const obs = await service.getPeriodObligations(year, month);
      const ob = obs.find((o) => o.status === 'PENDING');
      if (!ob) return;

      const accs = await adapter.getAccounts(MOCK_USER_ID);
      const acc = accs.find((a) => a.currentBalance >= ob.amountPending);
      if (!acc) return;

      await service.recordPayment({ obligationId: ob.id, accountId: acc.id, amount: ob.amountPending });

      const updated = await adapter.getObligationById(MOCK_USER_ID, ob.id);
      expect(updated!.status).toBe('PAID');
      expect(updated!.amountPending).toBe(0);
    });
  });

  describe('MI-03: Cuenta debita exactamente el monto pagado', () => {
    it('saldo de cuenta decrece exactamente en el monto del pago', async () => {
      const { year, month } = currentPeriod();
      const obs = await service.getPeriodObligations(year, month);
      const ob = obs.find((o) => o.status === 'PENDING' && o.amountPending >= 100);
      if (!ob) return;

      const accs = await adapter.getAccounts(MOCK_USER_ID);
      const acc = accs.find((a) => a.currentBalance >= 100);
      if (!acc) return;

      const balanceBefore = acc.currentBalance;
      await service.recordPayment({ obligationId: ob.id, accountId: acc.id, amount: 100 });

      const updatedAccs = await adapter.getAccounts(MOCK_USER_ID);
      const accAfter = updatedAccs.find((a) => a.id === acc.id)!;
      expect(Math.abs((balanceBefore - 100) - accAfter.currentBalance)).toBeLessThan(0.01);
    });
  });

  describe('MI-04: Sobrepago rechazado', () => {
    it('pagar más del saldo pendiente lanza error', async () => {
      const { year, month } = currentPeriod();
      const obs = await service.getPeriodObligations(year, month);
      const ob = obs.find((o) => o.status === 'PENDING');
      if (!ob) return;

      const accs = await adapter.getAccounts(MOCK_USER_ID);
      const acc = accs.find((a) => a.currentBalance >= ob.amountPending + 1);
      if (!acc) return;

      await expect(
        service.recordPayment({ obligationId: ob.id, accountId: acc.id, amount: ob.amountPending + 1 })
      ).rejects.toThrow(/sobrepago/i);
    });
  });

  describe('MI-05: Pago con saldo insuficiente en cuenta rechazado', () => {
    it('saldo de cuenta menor al pago lanza error', async () => {
      const { year, month } = currentPeriod();
      const obs = await service.getPeriodObligations(year, month);
      const ob = obs.find((o) => o.status === 'PENDING');
      if (!ob) return;

      const smallAcc = await adapter.createAccount(MOCK_USER_ID, { name: 'Cuenta Vacia', type: 'CASH', initialBalance: 0 });

      await expect(
        service.recordPayment({ obligationId: ob.id, accountId: smallAcc.id, amount: ob.amountPending })
      ).rejects.toThrow(/saldo insuficiente/i);
    });
  });
});

describe('PeriodObligationsService — Autenticación requerida en modo supabase', () => {
  it('lanza error cuando el usuario no está autenticado y el modo es supabase', async () => {
    const adapter = new LocalFinancialAdapter();
    adapter.resetAll();

    TestBed.configureTestingModule({
      providers: [
        PeriodObligationsService,
        { provide: PERIOD_OBLIGATION_REPOSITORY, useValue: adapter },
        { provide: AuthService, useValue: makeMockAuthService(null) },
        { provide: FINANCIAL_CONFIG, useValue: { ...DEFAULT_FINANCIAL_CONFIG, providerMode: 'supabase' } },
      ],
    });

    const svc = TestBed.inject(PeriodObligationsService);
    const d = new Date();
    await expect(svc.getPeriodObligations(d.getFullYear(), d.getMonth() + 1)).rejects.toThrow(/autenticada/i);
  });
});
