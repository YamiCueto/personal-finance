import { CreditProduct, ObligationPayment, PeriodObligation } from '../models/financial-v2.model';
import { DebtHistory } from '../models/debt-tracking.model';
import { FinancialCalculatorV2 as Money } from './financial-calculator-v2';

export function allocatePaymentCascade(obligation: PeriodObligation, payments: ObligationPayment[], amount: number) {
  const active = payments.filter(p => p.obligationId === obligation.id && !p.isReversed && p.paymentType !== 'PREPAYMENT_CAPITAL');
  const sumField = (field: 'appliedToCapital' | 'appliedToInterest' | 'appliedToInsurance' | 'appliedToFees') =>
    Money.fromCents(active.reduce((s, p) => s + Money.toCents(p[field]), 0));
  let remaining = Math.max(0, Money.toCents(Number.isFinite(amount) ? amount : 0));
  const take = (scheduled: number, paid: number) => {
    const value = Math.min(remaining, Math.max(0, Money.toCents(scheduled) - Money.toCents(paid)));
    remaining -= value;
    return Money.fromCents(value);
  };
  const appliedToFees = take(obligation.otherFeesComponent, sumField('appliedToFees'));
  const appliedToInsurance = take(obligation.insuranceComponent, sumField('appliedToInsurance'));
  const appliedToInterest = take(obligation.interestCurrentComponent + obligation.interestMoraComponent, sumField('appliedToInterest'));
  const appliedToCapital = Money.fromCents(remaining);
  return { appliedToCapital, appliedToInterest, appliedToInsurance, appliedToFees };
}

export function debtOverallTotals(history: DebtHistory) {
  const sum = (values: number[]) => Money.fromCents(values.reduce((total, value) => total + Money.toCents(value), 0));
  const movements = history.payments.flatMap(payment => [
    { capital: payment.appliedToCapital, interest: payment.appliedToInterest, insurance: payment.appliedToInsurance, fees: payment.appliedToFees, amount: payment.amount },
    ...(payment.isReversed && payment.reversedAt ? [{ capital: -payment.appliedToCapital, interest: -payment.appliedToInterest, insurance: -payment.appliedToInsurance, fees: -payment.appliedToFees, amount: -payment.amount }] : []),
  ]);
  const insurance = sum(movements.map(m => m.insurance));
  const fees = sum(movements.map(m => m.fees));
  return {
    paid: sum(movements.map(m => m.amount)),
    capital: sum(movements.map(m => m.capital)),
    interest: sum(movements.map(m => m.interest)),
    insurance,
    fees,
    charges: Money.fromCents(Money.toCents(insurance) + Money.toCents(fees)),
  };
}

export function debtYearSummary(product: CreditProduct, history: DebtHistory, year: number) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const sum = (values: number[]) => Money.fromCents(values.reduce((total, value) => total + Money.toCents(value), 0));
  const movements = history.payments.flatMap(payment => [
    { date: payment.paymentDate.slice(0, 10), capital: payment.appliedToCapital, interest: payment.appliedToInterest, insurance: payment.appliedToInsurance, fees: payment.appliedToFees, amount: payment.amount },
    ...(payment.isReversed && payment.reversedAt ? [{ date: payment.reversedAt.slice(0, 10), capital: -payment.appliedToCapital, interest: -payment.appliedToInterest, insurance: -payment.appliedToInsurance, fees: -payment.appliedToFees, amount: -payment.amount }] : []),
  ]);
  const balanceAt = (date: string) => sum([
    product.openingPrincipalBalance ?? product.currentPrincipalBalance,
    ...movements.filter(m => m.date < date).map(m => -m.capital),
    ...history.reconciliations.filter(r => r.statementDate < date).map(r => r.difference),
  ]);
  const period = movements.filter(m => m.date >= start && m.date < end);
  const obligations = history.obligations.filter(o => o.periodYear === year);
  return {
    opening: balanceAt(start), closing: balanceAt(end),
    paid: sum(period.map(m => m.amount)), capital: sum(period.map(m => m.capital)),
    interest: sum(period.map(m => m.interest)), insurance: sum(period.map(m => m.insurance)), fees: sum(period.map(m => m.fees)),
    count: obligations.length,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const next = month === 12 ? end : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthly = movements.filter(m => m.date.startsWith(prefix));
      return {
        month,
        beforeTracking: !!product.trackingStartDate && prefix < product.trackingStartDate.slice(0, 7),
        obligations: obligations.filter(o => o.periodMonth === month),
        payments: history.payments.filter(p => p.paymentDate.startsWith(prefix) || p.reversedAt?.startsWith(prefix)),
        paid: sum(monthly.map(m => m.amount)), capital: sum(monthly.map(m => m.capital)), interest: sum(monthly.map(m => m.interest)),
        insurance: sum(monthly.map(m => m.insurance)), fees: sum(monthly.map(m => m.fees)), balance: balanceAt(next),
      };
    }),
  };
}

export function trackedInstallment(product: CreditProduct, year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Período inválido.');
  if (prefix < product.nextDueDate!.slice(0, 7)) throw new Error('Sin historial registrado: el período precede al próximo vencimiento.');
  if (product.currentPrincipalBalance <= 0 || product.status === 'CANCELLED') throw new Error('La deuda no tiene saldo exigible.');
  const interest = product.knownInterestMonthly ?? 0;
  const insurance = product.associatedInsurancesMonthly;
  const fees = product.managementFeeMonthly;
  const capital = Math.min(product.currentPrincipalBalance, Money.fromCents(Money.toCents(product.agreedInstallment!) - Money.toCents(interest) - Money.toCents(insurance) - Money.toCents(fees)));
  const day = Math.min(Number(product.nextDueDate!.slice(8, 10)), new Date(year, month, 0).getDate());
  return { capital, interest, insurance, fees, amount: Money.fromCents([capital, interest, insurance, fees].reduce((s, n) => s + Money.toCents(n), 0)), dueDate: `${prefix}-${String(day).padStart(2, '0')}` };
}
