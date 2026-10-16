import { InjectionToken } from '@angular/core';
import {
  FinancialAccount,
  FinancialInstitution,
  CreditProduct,
  PeriodObligation,
  RecurrentObligation,
  Income,
  ObligationPayment,
  InternalAccountTransfer,
  PaymentBreakdownInput,
  CreditCardPurchase,
} from '../models/financial-v2.model';

export interface CreateAccountDTO {
  name: string;
  type: FinancialAccount['type'];
  institutionId?: string;
  initialBalance: number;
  statementCutoffDay?: number;
  color?: string;
}

export interface CreateCreditProductDTO {
  institutionId?: string;
  name: string;
  type: CreditProduct['type'];
  originalPrincipal: number;
  nominalRateMonthly: number;
  effectiveAnnualRate: number;
  totalInstallments?: number;
  remainingInstallments?: number;
  amortizationMethod?: CreditProduct['amortizationMethod'];
  associatedInsurancesMonthly?: number;
  approvedCreditLimit?: number;
  statementCutoffDay?: number;
  paymentDueDay?: number;
  managementFeeMonthly?: number;
}

export interface CreateCreditCardPurchaseDTO {
  creditCardId: string;
  description: string;
  amount: number;
  totalInstallments: number;
  purchaseDate?: string;
  interestRateMonthly?: number;
}

export interface GenerateInstallmentDTO {
  creditProductId: string;
  periodYear: number;
  periodMonth: number;
  dueDate?: string;
}

export interface CreateIncomeDTO {
  accountId?: string;
  periodYear: number;
  periodMonth: number;
  sourceName: string;
  amount: number;
  receivedDate?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface CreateObligationDTO {
  name: string;
  amount: number;
  periodYear: number;
  periodMonth: number;
  sourceType: PeriodObligation['sourceType'];
  dueDate?: string;
  creditProductId?: string;
  capitalComponent?: number;
  interestCurrentComponent?: number;
  insuranceComponent?: number;
  notes?: string;
}

export interface RecordPaymentDTO {
  obligationId: string;
  accountId: string;
  amount: number;
  paymentType?: ObligationPayment['paymentType'];
  idempotencyKey?: string;
  allocation?: PaymentBreakdownInput;
  referenceNumber?: string;
  notes?: string;
}

export interface RecordTransferDTO {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  feeAmount?: number;
  idempotencyKey?: string;
  notes?: string;
}

export interface RecordRestructureDTO {
  creditProductId: string;
  newPrincipalBalance: number;
  newEffectiveAnnualRate: number;
  newTotalInstallments: number;
  refinancingFees?: number;
  reason: string;
}

export interface ReverseOperationDTO {
  operationType: 'PAYMENT' | 'TRANSFER' | 'INCOME';
  operationId: string;
  reason: string;
}

export interface FinancialOperationResult {
  success: boolean;
  operationId: string;
  isReplayed?: boolean;
  message?: string;
  appliedToCapital?: number;
  appliedToInterest?: number;
  newBalance?: number;
}

/**
 * Contrato del Repositorio de Cuentas e Instituciones
 */
export interface IFinancialAccountRepository {
  getInstitutions(userId: string): Promise<FinancialInstitution[]>;
  createInstitution(userId: string, name: string, type: FinancialInstitution['type']): Promise<FinancialInstitution>;
  getAccounts(userId: string): Promise<FinancialAccount[]>;
  getAccountById(userId: string, accountId: string): Promise<FinancialAccount | null>;
  createAccount(userId: string, dto: CreateAccountDTO): Promise<FinancialAccount>;
  archiveAccount(userId: string, accountId: string): Promise<void>;
}

/**
 * Contrato del Repositorio de Productos Crediticios
 */
export interface ICreditProductRepository {
  getCreditProducts(userId: string): Promise<CreditProduct[]>;
  getCreditProductById(userId: string, creditId: string): Promise<CreditProduct | null>;
  createCreditProduct(userId: string, dto: CreateCreditProductDTO): Promise<CreditProduct>;
  recordRestructure(userId: string, dto: RecordRestructureDTO): Promise<FinancialOperationResult>;
  getCreditCardPurchases(userId: string, creditCardId?: string): Promise<CreditCardPurchase[]>;
  createCreditCardPurchase(userId: string, dto: CreateCreditCardPurchaseDTO): Promise<CreditCardPurchase>;
  generateCreditInstallmentObligation(userId: string, dto: GenerateInstallmentDTO): Promise<PeriodObligation>;
}

/**
 * Contrato del Repositorio de Obligaciones y Cuotas del Período
 */
export interface IPeriodObligationRepository {
  getPeriodObligations(userId: string, year: number, month: number): Promise<PeriodObligation[]>;
  getObligationById(userId: string, obligationId: string): Promise<PeriodObligation | null>;
  createPeriodObligation(userId: string, dto: CreateObligationDTO): Promise<PeriodObligation>;
  recordPayment(userId: string, dto: RecordPaymentDTO): Promise<FinancialOperationResult>;
}

/**
 * Contrato del Repositorio de Ingresos
 */
export interface IIncomeRepository {
  getIncomes(userId: string, year: number, month: number): Promise<Income[]>;
  recordIncome(userId: string, dto: CreateIncomeDTO): Promise<FinancialOperationResult>;
}

/**
 * Contrato del Repositorio de Operaciones Atómicas y Reversos
 */
export interface ITransactionalOperationRepository {
  recordTransfer(userId: string, dto: RecordTransferDTO): Promise<FinancialOperationResult>;
  reverseOperation(userId: string, dto: ReverseOperationDTO): Promise<FinancialOperationResult>;
}

// Tokens de inyección de dependencias para permitir sustitución desacoplada
export const FINANCIAL_ACCOUNT_REPOSITORY = new InjectionToken<IFinancialAccountRepository>('FINANCIAL_ACCOUNT_REPOSITORY');
export const CREDIT_PRODUCT_REPOSITORY = new InjectionToken<ICreditProductRepository>('CREDIT_PRODUCT_REPOSITORY');
export const PERIOD_OBLIGATION_REPOSITORY = new InjectionToken<IPeriodObligationRepository>('PERIOD_OBLIGATION_REPOSITORY');
export const INCOME_REPOSITORY = new InjectionToken<IIncomeRepository>('INCOME_REPOSITORY');
export const TRANSACTIONAL_OPERATION_REPOSITORY = new InjectionToken<ITransactionalOperationRepository>('TRANSACTIONAL_OPERATION_REPOSITORY');
