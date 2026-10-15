import { FinancialCalculator } from './financial-calculator';
import { FinancialAccount, Income, Obligation } from '../models/financial.model';

describe('FinancialCalculator', () => {
  const mockAccounts: FinancialAccount[] = [
    {
      id: 'acc-1',
      userId: 'usr-1',
      name: 'Banco Occidente',
      accountType: 'SAVINGS',
      initialBalance: 5000000,
      currentBalance: 5000000,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'acc-2',
      userId: 'usr-1',
      name: 'Efectivo',
      accountType: 'CASH',
      initialBalance: 200000,
      currentBalance: 200000,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const mockIncomes: Income[] = [
    {
      id: 'inc-1',
      userId: 'usr-1',
      accountId: 'acc-1',
      amount: 9459818,
      description: 'Salario Base Enero',
      receivedDate: '2026-01-15',
      periodYear: 2026,
      periodMonth: 1,
      createdAt: '2026-01-15',
    },
  ];

  const mockObligations: Obligation[] = [
    {
      id: 'ob-1',
      userId: 'usr-1',
      name: 'B. Occidente',
      amount: 3760000,
      periodYear: 2026,
      periodMonth: 1,
      status: 'PAID',
      amountPaid: 3760000,
      amountPending: 0,
      orderIndex: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'ob-2',
      userId: 'usr-1',
      name: 'Sistecrédito',
      amount: 320130,
      periodYear: 2026,
      periodMonth: 1,
      status: 'PENDING',
      amountPaid: 0,
      amountPending: 320130,
      orderIndex: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  it('calculates monthly summary following exact Excel formulas', () => {
    const summary = FinancialCalculator.calculateMonthlySummary(
      2026,
      1,
      mockIncomes,
      mockObligations,
      mockAccounts
    );

    expect(summary.totalIncome).toBe(9459818);
    expect(summary.totalObligations).toBe(4080130);
    expect(summary.totalPaid).toBe(3760000);
    expect(summary.totalPending).toBe(320130);
    expect(summary.totalFree).toBe(9459818 - 4080130);
    expect(summary.realBalance).toBe(5200000);
    expect(summary.projectedBalance).toBe(5200000 - 320130);
  });

  it('calculates cascading waterfall resto correctly for each obligation', () => {
    const waterfall = FinancialCalculator.calculateCascadeWaterfall(9459818, mockObligations);

    expect(waterfall[0].remainingResto).toBe(9459818 - 3760000);
    expect(waterfall[1].remainingResto).toBe(9459818 - 3760000 - 320130);
  });

  it('applies partial payment correctly and transitions status', () => {
    const targetObligation: Obligation = {
      id: 'ob-test',
      userId: 'usr-1',
      name: 'Addi',
      amount: 800000,
      periodYear: 2026,
      periodMonth: 1,
      status: 'PENDING',
      amountPaid: 0,
      amountPending: 800000,
      orderIndex: 3,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const payment1 = FinancialCalculator.applyPaymentToObligation(targetObligation, 300000);
    expect(payment1.updatedObligation.status).toBe('PARTIAL');
    expect(payment1.updatedObligation.amountPaid).toBe(300000);
    expect(payment1.updatedObligation.amountPending).toBe(500000);
    expect(payment1.effectiveAmountPaid).toBe(300000);

    const payment2 = FinancialCalculator.applyPaymentToObligation(
      payment1.updatedObligation,
      500000
    );
    expect(payment2.updatedObligation.status).toBe('PAID');
    expect(payment2.updatedObligation.amountPaid).toBe(800000);
    expect(payment2.updatedObligation.amountPending).toBe(0);
  });

  it('prevents overpayment beyond total obligation amount', () => {
    const targetObligation: Obligation = {
      id: 'ob-test',
      userId: 'usr-1',
      name: 'Netflix',
      amount: 45000,
      periodYear: 2026,
      periodMonth: 1,
      status: 'PENDING',
      amountPaid: 0,
      amountPending: 45000,
      orderIndex: 4,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const payment = FinancialCalculator.applyPaymentToObligation(targetObligation, 50000);
    expect(payment.updatedObligation.amountPaid).toBe(45000);
    expect(payment.updatedObligation.amountPending).toBe(0);
    expect(payment.effectiveAmountPaid).toBe(45000);
    expect(payment.updatedObligation.status).toBe('PAID');
  });
});
