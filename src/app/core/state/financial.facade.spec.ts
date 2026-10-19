import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { FinancialFacade } from './financial.facade';
import { provideFinancialCore } from '../providers/financial-core.provider';
import { LocalFinancialAdapter } from '../repositories/local-financial.adapter';
import { AuthService } from '../services/auth.service';
import {
  CreateAccountDTO,
  CreateIncomeDTO,
  RecordPaymentDTO,
  RecordTransferDTO,
} from '../repositories/financial-repositories.contract';

describe('Financial Core V2 — Integration & Unit Test Suite (Sprint 2 / Fase 1)', () => {
  let facade: FinancialFacade;
  let adapter: LocalFinancialAdapter;

  let activeUserSignal = signal<User | null>({
    id: 'user-test-a',
    email: 'test-a@vault.secure',
  } as User);

  const mockAuthService = {
    currentUser: activeUserSignal,
  };

  beforeEach(() => {
    activeUserSignal.set({
      id: 'user-test-a',
      email: 'test-a@vault.secure',
    } as User);

    TestBed.configureTestingModule({
      providers: [
        provideFinancialCore({ providerMode: 'local-demo' }),
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    facade = TestBed.inject(FinancialFacade);
    adapter = TestBed.inject(LocalFinancialAdapter);
    adapter.resetAll();
  });

  // 1. Carga inicial de cuentas
  it('1. should load initial accounts for active user', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    expect(facade.accounts().length).toBe(2);
    expect(facade.accounts().map((a) => a.name)).toEqual([
      'Cuenta Principal Ahorros',
      'Billetera Digital Nequi',
    ]);
  });

  // 2. Carga de obligaciones por período
  it('2. should load obligations for a specified period and calculate pending obligations', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    expect(facade.periodObligations().length).toBe(2);
    expect(facade.totalPendingObligations()).toBe(1125000); // 980,000 + 145,000
  });

  // 3. Estados vacíos
  it('3. should handle empty state for user with no data', async () => {
    activeUserSignal.set({ id: 'empty-user-999', email: 'empty@vault.secure' } as User);
    await facade.loadPeriodData({ year: 2026, month: 1 });

    expect(facade.accounts().length).toBe(0);
    expect(facade.periodObligations().length).toBe(0);
    expect(facade.incomes().length).toBe(0);
    expect(facade.totalLiquidBalance()).toBe(0);
    expect(facade.totalPendingObligations()).toBe(0);
  });

  // 4. Estados de error
  it('4. should gracefully capture and normalize domain error state', async () => {
    const invalidDto: CreateIncomeDTO = {
      accountId: 'acc-ahorros-principal',
      periodYear: 2026,
      periodMonth: 5,
      sourceName: '',
      amount: -500, // Monto inválido menor o igual a 0
      receivedDate: '2026-05-15',
    };

    await expect(facade.recordIncome(invalidDto)).rejects.toThrow();
  });

  // 5. Aislamiento entre usuarios ficticios
  it('5. should enforce strict logical multi-tenant isolation between mock users', async () => {
    activeUserSignal.set({ id: 'user-tenant-1', email: 't1@vault.secure' } as User);
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const tenant1Balance = facade.totalLiquidBalance();

    activeUserSignal.set({ id: 'user-tenant-2', email: 't2@vault.secure' } as User);
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const tenant2Balance = facade.totalLiquidBalance();

    expect(tenant1Balance).toBe(5250000);
    expect(tenant2Balance).toBe(5250000);

    // Mutate tenant 1
    activeUserSignal.set({ id: 'user-tenant-1', email: 't1@vault.secure' } as User);
    await facade.recordIncome({
      accountId: 'acc-ahorros-principal',
      periodYear: 2026,
      periodMonth: 5,
      sourceName: 'Bono Extra Tenant 1',
      amount: 1000000,
      receivedDate: '2026-05-15',
    });

    expect(facade.totalLiquidBalance()).toBe(6250000);

    // Verify tenant 2 remains completely unaltered
    activeUserSignal.set({ id: 'user-tenant-2', email: 't2@vault.secure' } as User);
    await facade.loadPeriodData({ year: 2026, month: 5 });
    expect(facade.totalLiquidBalance()).toBe(5250000);
  });

  // 6. Registro de ingresos
  it('6. should record income and increment account balance reactively', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const initialBalance = facade.totalLiquidBalance();

    await facade.recordIncome({
      accountId: 'acc-nequi-billetera',
      periodYear: 2026,
      periodMonth: 5,
      sourceName: 'Honorarios Asesoría',
      amount: 500000,
      receivedDate: '2026-05-20',
    });

    expect(facade.totalLiquidBalance()).toBe(initialBalance + 500000);
    expect(facade.incomes().some((i) => i.sourceName === 'Honorarios Asesoría')).toBe(true);
  });

  // 7. Pago parcial
  it('7. should process partial obligation payment, decreasing debt and account balance', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const targetObligation = facade.periodObligations().find((o) => o.id === 'ob-servicios-internet')!;
    const initialLiquid = facade.totalLiquidBalance();

    const paymentDto: RecordPaymentDTO = {
      obligationId: targetObligation.id,
      accountId: 'acc-nequi-billetera',
      amount: 45000, // Parcial de 145,000
    };

    const res = await facade.recordPayment(paymentDto);
    expect(res.success).toBe(true);

    const updatedOb = facade.periodObligations().find((o) => o.id === targetObligation.id)!;
    expect(updatedOb.amountPaid).toBe(45000);
    expect(updatedOb.amountPending).toBe(100000);
    expect(updatedOb.status).toBe('PARTIAL');
    expect(facade.totalLiquidBalance()).toBe(initialLiquid - 45000);
  });

  // 8. Pago completo
  it('8. should process full obligation payment and set status to PAID', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const targetObligation = facade.periodObligations().find((o) => o.id === 'ob-servicios-internet')!;

    const paymentDto: RecordPaymentDTO = {
      obligationId: targetObligation.id,
      accountId: 'acc-nequi-billetera',
      amount: 145000, // Pago total
    };

    const res = await facade.recordPayment(paymentDto);
    expect(res.success).toBe(true);

    const updatedOb = facade.periodObligations().find((o) => o.id === targetObligation.id)!;
    expect(updatedOb.amountPaid).toBe(145000);
    expect(updatedOb.amountPending).toBe(0);
    expect(updatedOb.status).toBe('PAID');
  });

  // 9. Rechazo de sobrepago
  it('9. should reject overpayment exceeding pending obligation balance', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const targetObligation = facade.periodObligations().find((o) => o.id === 'ob-servicios-internet')!;

    const overpaymentDto: RecordPaymentDTO = {
      obligationId: targetObligation.id,
      accountId: 'acc-nequi-billetera',
      amount: 200000, // Excede 145,000
    };

    await expect(facade.recordPayment(overpaymentDto)).rejects.toThrow(/sobrepago/i);
  });

  // 10. Transferencias entre cuentas
  it('10. should transfer funds between accounts respecting balance conservation', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const sourceAcc = facade.accounts().find((a) => a.id === 'acc-ahorros-principal')!;
    const destAcc = facade.accounts().find((a) => a.id === 'acc-nequi-billetera')!;
    const initialSourceBalance = sourceAcc.currentBalance;
    const initialDestBalance = destAcc.currentBalance;

    const transferDto: RecordTransferDTO = {
      fromAccountId: sourceAcc.id,
      toAccountId: destAcc.id,
      amount: 300000,
      notes: 'Traslado para gastos quincenales',
    };

    const res = await facade.recordTransfer(transferDto);
    expect(res.success).toBe(true);

    const updatedSource = facade.accounts().find((a) => a.id === sourceAcc.id)!;
    const updatedDest = facade.accounts().find((a) => a.id === destAcc.id)!;

    expect(updatedSource.currentBalance).toBe(initialSourceBalance - 300000);
    expect(updatedDest.currentBalance).toBe(initialDestBalance + 300000);
    expect(facade.totalLiquidBalance()).toBe(initialSourceBalance + initialDestBalance);
  });

  // 11. Idempotencia de operaciones
  it('11. should enforce idempotency returning the existing operation for identical key', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const sourceAcc = facade.accounts().find((a) => a.id === 'acc-ahorros-principal')!;
    const initialSource = sourceAcc.currentBalance;

    const transferDto: RecordTransferDTO = {
      fromAccountId: 'acc-ahorros-principal',
      toAccountId: 'acc-nequi-billetera',
      amount: 150000,
      idempotencyKey: 'idemp-tx-test-unique-key-101',
    };

    const res1 = await facade.recordTransfer(transferDto);
    const res2 = await facade.recordTransfer(transferDto);

    expect(res1.operationId).toBe(res2.operationId);
    expect(res2.isReplayed).toBe(true);

    const updatedSource = facade.accounts().find((a) => a.id === 'acc-ahorros-principal')!;
    expect(updatedSource.currentBalance).toBe(initialSource - 150000); // Solo descontado una vez
  });

  // 12. Doble clic sobre acciones financieras
  it('12. should prevent duplicate execution on concurrent double click', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    const paymentDto: RecordPaymentDTO = {
      obligationId: 'ob-servicios-internet',
      accountId: 'acc-nequi-billetera',
      amount: 20000,
    };

    // Al lanzar dos pagos idénticos simultáneos, el protector de intención bloquea la segunda solicitud duplicada
    const p1 = facade.recordPayment(paymentDto);
    const p2 = facade.recordPayment(paymentDto);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const updatedOb = facade.periodObligations().find((o) => o.id === 'ob-servicios-internet')!;
    expect(updatedOb.amountPaid).toBe(20000); // No duplicado a 40,000
  });

  // 13. Actualización reactiva de saldos
  it('13. should reactively update computed totalLiquidBalance signal upon account creation', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });
    expect(facade.totalLiquidBalance()).toBe(5250000);

    const newAccDto: CreateAccountDTO = {
      name: 'Bolsillo Ahorro Programado',
      type: 'SAVINGS',
      initialBalance: 800000,
    };

    await facade.createAccount(newAccDto);
    expect(facade.totalLiquidBalance()).toBe(6050000);
  });

  // 14. Cálculo de dinero libre y obligaciones pendientes
  it('14. should accurately compute totalFreeProjected and monthly waterfall', async () => {
    await facade.loadPeriodData({ year: 2026, month: 5 });

    // Seeded: Income = 5,800,000 | Obligations = 980,000 + 145,000 = 1,125,000
    expect(facade.totalIncome()).toBe(5800000);
    expect(facade.totalPendingObligations()).toBe(1125000);
    expect(facade.totalFreeProjected()).toBe(5800000 - 1125000); // 4,675,000

    const waterfall = facade.monthlyWaterfall();
    expect(waterfall.length).toBe(2);
    expect(waterfall[0].remainingResto).toBe(5800000 - 980000); // 4,820,000
    expect(waterfall[1].remainingResto).toBe(4820000 - 145000); // 4,675,000
  });
});
