import { CreditProduct, ObligationPayment, PeriodObligation } from './financial-v2.model';

export interface ExistingDebtInput {
  institutionId: string;
  name: string;
  type: CreditProduct['type'];
  obligationKind: 'FINANCED_DEBT' | 'BALANCE_COMMITMENT';
  openingPrincipalBalance: number;
  trackingStartDate: string;
  nextDueDate: string;
  agreedInstallment: number;
  remainingInstallments?: number;
  nominalRateMonthly?: number;
  knownInterestMonthly: number;
  insuranceMonthly: number;
  feesMonthly: number;
  notes?: string;
  idempotencyKey: string;
}

export interface DebtReconciliation {
  id: string;
  userId: string;
  creditProductId: string;
  statementDate: string;
  calculatedBalance: number;
  reportedBalance: number;
  difference: number;
  reason: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface ReconcileDebtInput {
  creditProductId: string;
  statementDate: string;
  reportedBalance: number;
  expectedBalance: number;
  reason: string;
  idempotencyKey: string;
}

export interface DebtHistory {
  obligations: PeriodObligation[];
  payments: ObligationPayment[];
  reconciliations: DebtReconciliation[];
}

export function validateExistingDebt(dto: ExistingDebtInput): void {
  const money = [dto.openingPrincipalBalance, dto.agreedInstallment, dto.knownInterestMonthly, dto.insuranceMonthly, dto.feesMonthly];
  if (!dto.name.trim() || !dto.institutionId || !dto.idempotencyKey || money.some(n => !Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001)) throw new Error('Completa los datos de la deuda con importes válidos de hasta dos decimales.');
  if (dto.openingPrincipalBalance <= 0 || dto.agreedInstallment <= dto.knownInterestMonthly + dto.insuranceMonthly + dto.feesMonthly) throw new Error('El saldo y el capital de la cuota deben ser mayores a cero.');
  if (!validDate(dto.trackingStartDate) || !validDate(dto.nextDueDate) || dto.nextDueDate < dto.trackingStartDate) throw new Error('El próximo vencimiento debe ser igual o posterior a la fecha de corte.');
  if (dto.remainingInstallments !== undefined && (!Number.isInteger(dto.remainingInstallments) || dto.remainingInstallments < 1)) throw new Error('Las cuotas pendientes deben ser un entero positivo.');
  if (dto.nominalRateMonthly !== undefined && (!Number.isFinite(dto.nominalRateMonthly) || dto.nominalRateMonthly < 0)) throw new Error('La tasa no puede ser negativa.');
  if (dto.type === 'CREDIT_CARD') throw new Error('Registra las tarjetas desde el módulo de tarjetas.');
}

export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
