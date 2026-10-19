import {
  FinancialAccount,
  Income,
  MonthlyLedgerSummary,
  Obligation,
  ObligationPayment,
} from '../models/financial.model';

export class FinancialCalculator {
  static calculateMonthlySummary(
    year: number,
    month: number,
    incomes: Income[],
    obligations: Obligation[],
    accounts: FinancialAccount[]
  ): MonthlyLedgerSummary {
    const periodIncomes = incomes.filter(
      (inc) => inc.periodYear === year && inc.periodMonth === month
    );
    const periodObligations = obligations.filter(
      (ob) => ob.periodYear === year && ob.periodMonth === month
    );

    const totalIncome = periodIncomes.reduce((acc, curr) => acc + curr.amount, 0);
    const totalObligations = periodObligations.reduce((acc, curr) => acc + curr.amount, 0);
    const totalPaid = periodObligations.reduce((acc, curr) => acc + curr.amountPaid, 0);
    const totalPending = periodObligations.reduce((acc, curr) => acc + curr.amountPending, 0);

    const totalFree = totalIncome - totalObligations;
    const realBalance = accounts.reduce((acc, curr) => acc + curr.currentBalance, 0);
    const projectedBalance = realBalance - totalPending;

    return {
      periodYear: year,
      periodMonth: month,
      totalIncome,
      totalObligations,
      totalPaid,
      totalPending,
      totalFree,
      realBalance,
      projectedBalance,
    };
  }

  static calculateCascadeWaterfall(
    totalIncome: number,
    obligations: Obligation[]
  ): Array<Obligation & { remainingResto: number }> {
    let runningResto = totalIncome;

    return obligations.map((ob) => {
      runningResto -= ob.amount;
      return {
        ...ob,
        remainingResto: runningResto,
      };
    });
  }

  static applyPaymentToObligation(
    obligation: Obligation,
    paymentAmount: number
  ): { updatedObligation: Obligation; effectiveAmountPaid: number } {
    if (paymentAmount <= 0) {
      throw new Error('El valor del pago debe ser estrictamente mayor a 0');
    }

    const previousPaid = obligation.amountPaid || 0;
    const newPaid = Math.min(obligation.amount, previousPaid + paymentAmount);
    const effectiveAmountPaid = newPaid - previousPaid;
    const newPending = Math.max(0, obligation.amount - newPaid);

    let newStatus = obligation.status;
    if (newPending === 0) {
      newStatus = 'PAID';
    } else if (newPaid > 0) {
      newStatus = 'PARTIAL';
    } else {
      newStatus = 'PENDING';
    }

    return {
      updatedObligation: {
        ...obligation,
        amountPaid: newPaid,
        amountPending: newPending,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      },
      effectiveAmountPaid,
    };
  }
}
