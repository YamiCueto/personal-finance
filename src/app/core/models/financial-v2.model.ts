/**
 * ============================================================================
 * PERSONAL FINANCE — DOMAIN MODEL V2 (FINANCIAL CORE)
 * ============================================================================
 * Sistema de Control Financiero Personal, Cartera, Deudas, Amortizaciones y Flujo de Caja.
 * Moneda: COP (dos decimales). Sin pérdida de precisión, aritmética exacta.
 */

export type CurrencyCode = 'COP' | 'USD';

/**
 * A. Instituciones y Proveedores
 * Bancos, aseguradoras, comercios, plataformas digitales, fondos.
 */
export interface FinancialInstitution {
  id: string;
  userId: string;
  name: string; // ej. Banco de Occidente, RappiPay, SURA, Addi, Jamar
  code?: string; // ej. B_OCCIDENTE, BANCOLOMBIA
  type: 'BANK' | 'FINTECH' | 'INSURANCE' | 'MERCHANT' | 'SERVICE_PROVIDER' | 'OTHER';
  websiteUrl?: string;
  phoneContact?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * B. Cuentas Financieras (Activos Líquidos)
 */
export type AccountType = 'SAVINGS' | 'CHECKING' | 'CASH' | 'DIGITAL_WALLET' | 'INVESTMENT';

export interface FinancialAccount {
  id: string;
  userId: string;
  institutionId?: string;
  name: string; // ej. Bancolombia Ahorros, Billetes en Mano, Nequi
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: number;
  currentBalance: number;
  statementCutoffDay?: number;
  color?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * C. Tipos de Productos Crediticios (Pasivos)
 */
export type CreditProductType =
  | 'VEHICLE_LOAN'
  | 'PERSONAL_LOAN'
  | 'CONSUMER_LOAN'
  | 'COMMERCIAL_LOAN'
  | 'CREDIT_CARD'
  | 'MERCHANT_FINANCING'
  | 'OTHER_CREDIT';

export type AmortizationMethod = 'FRENCH' | 'GERMAN' | 'AMERICAN' | 'FIXED_INSTALLMENT';
export type CapitalizationPeriod = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
export type ProductStatus = 'ACTIVE' | 'PAID_OFF' | 'RESTRUCTURED' | 'DEFAULTED' | 'CANCELLED';

/**
 * Producto Crediticio Maestro (Deuda consolidada / Línea de crédito)
 */
export interface CreditProduct {
  id: string;
  userId: string;
  institutionId: string;
  name: string; // ej. Crédito Vehículo Banco de Occidente, RappiCard Visa, Addi
  type: CreditProductType;
  status: ProductStatus;

  // Montos y Cupos
  originalPrincipal: number; // Capital original desembolsado
  currentPrincipalBalance: number; // Saldo de capital adeudado actual
  approvedCreditLimit?: number; // Para tarjetas: cupo aprobado
  usedCreditLimit?: number; // Para tarjetas: cupo utilizado
  availableCreditLimit?: number; // Para tarjetas: cupo disponible

  // Fechas clave
  disbursementDate?: string; // Fecha de desembolso
  statementCutoffDay?: number; // Día de corte (1-31)
  duePaymentDay?: number; // Día límite de pago (1-31)

  // Cuotas y plazo
  totalInstallments?: number; // Cuotas pactadas originales (ej. 60)
  remainingInstallments?: number; // Cuotas pendientes

  // Tasas de interés
  nominalRateMonthly: number; // Tasa nominal mes vencido (NMV) %
  effectiveAnnualRate: number; // Tasa efectiva anual (EA) %
  moratoriumRateAnnual?: number; // Tasa de usura/mora EA %
  capitalizationPeriod: CapitalizationPeriod;
  amortizationMethod: AmortizationMethod;

  // Cargos periódicos
  associatedInsurancesMonthly: number; // Seguro de vida / todo riesgo mensual
  managementFeeMonthly: number; // Cuota de manejo mensual si aplica

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tarjeta de Crédito (Extensión de detalle de compras y extractos)
 */
export interface CreditCardDetail {
  id: string;
  productId: string;
  userId: string;
  franchise: 'VISA' | 'MASTERCARD' | 'AMEX' | 'DINERS' | 'OTHER';
  lastFourDigits?: string;
  totalStatementBalance: number; // Saldo total facturado del período
  minimumPayment: number; // Pago mínimo exigido
  totalPaymentToAvoidInterest: number; // Pago total para no generar intereses
  statementDueDate?: string;
}

/**
 * Compra / Avance Diferido en Tarjeta de Crédito
 */
export interface CreditCardPurchase {
  id: string;
  productId: string;
  userId: string;
  purchaseDate: string;
  description: string;
  originalAmount: number;
  totalInstallments: number;
  remainingInstallments: number;
  interestRateMonthly: number;
  monthlyCapital: number;
  monthlyInterest: number;
  status: 'PENDING' | 'PAID';
  createdAt: string;
}

/**
 * D. Obligaciones Recurrentes (Gastos fijos, suscripciones, compromisos familiares)
 */
export type RecurrentObligationType =
  | 'SUBSCRIPTION'
  | 'PUBLIC_SERVICE'
  | 'TELECOM'
  | 'INSURANCE_POLICY'
  | 'GYM'
  | 'FAMILY_SUPPORT'
  | 'PERSONAL_COMMITMENT'
  | 'OTHER_RECURRENT';

export type RecurrentFrequency = 'MONTHLY' | 'BIMONTHLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface RecurrentObligation {
  id: string;
  userId: string;
  institutionId?: string;
  name: string; // ej. Spotify, Netflix, SURA Salud, Acueducto, Apoyo Mamá
  type: RecurrentObligationType;
  frequency: RecurrentFrequency;
  estimatedAmount: number;
  isVariableAmount: boolean;
  defaultDueDay?: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * E. Cuota / Obligación Exigible del Período (La unidad que aparece en el mes)
 * Corresponde a las filas del Excel (Columna B y C)
 */
export type ObligationSourceType = 'CREDIT_INSTALLMENT' | 'RECURRENT_EXPENSE' | 'AD_HOC_COMMITMENT';
export type ObligationStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface PeriodObligation {
  id: string;
  userId: string;
  creditProductId?: string; // Vinculación a crédito/tarjeta si aplica
  recurrentObligationId?: string; // Vinculación a suscripción/servicio si aplica
  sourceType: ObligationSourceType;

  periodYear: number;
  periodMonth: number;
  name: string; // ej. Cuota 14/60 Crédito Occidente, Jamar Cuota 3
  amount: number; // Valor exigible total del período
  dueDate?: string;
  orderIndex: number; // Orden de prelación para el cálculo de Resto en cascada
  status: ObligationStatus;

  // Descomposición financiera rigurosa de la cuota
  capitalComponent: number; // Abono a capital pactado
  interestCurrentComponent: number; // Interés corriente
  interestMoraComponent: number; // Interés de mora
  insuranceComponent: number; // Seguros
  otherFeesComponent: number; // Cuotas de manejo / cargos fijos contractuales

  // Estado de recaudación
  amountPaid: number;
  amountPending: number;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * F. Pagos y Abonos Efectuados
 */
export type PaymentType =
  | 'REGULAR_INSTALLMENT'
  | 'PARTIAL_PAYMENT'
  | 'PREPAYMENT_CAPITAL'
  | 'FULL_PAYMENT';

export type PaymentAllocationMethod =
  | 'EXPLICIT_BREAKDOWN'
  | 'CONTRACTUAL_CASCADE'
  | 'CAPITAL_PREPAYMENT';

export interface PaymentBreakdownInput {
  appliedToCapital?: number;
  appliedToInterest?: number;
  appliedToInsurance?: number;
  appliedToFees?: number;
}

export interface PaymentApplyOptions {
  allocationMethod?: PaymentAllocationMethod;
  breakdown?: PaymentBreakdownInput;
  idempotencyKey?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface ObligationPayment {
  id: string;
  userId: string;
  obligationId: string;
  accountId: string; // Cuenta de donde salieron los fondos
  paymentType: PaymentType;
  amount: number; // Monto efectivamente debitado
  paymentDate: string;

  // Desglose del pago real aplicado (sin inventar comisiones)
  appliedToCapital: number;
  appliedToInterest: number;
  appliedToInsurance: number;
  appliedToFees: number;

  referenceNumber?: string;
  idempotencyKey?: string;
  isReversed: boolean;
  reversedAt?: string;
  reversalReason?: string;
  notes?: string;
  createdAt: string;
}

/**
 * G. Rediferidos, Refinanciaciones y Reestructuraciones (Trazabilidad Histórica)
 */
export interface DebtRestructureEvent {
  id: string;
  userId: string;
  creditProductId: string;
  eventDate: string;

  // Datos previos
  previousPrincipalBalance: number;
  previousEffectiveAnnualRate: number;
  previousRemainingInstallments: number;

  // Nuevas condiciones pactadas
  newPrincipalBalance: number;
  newEffectiveAnnualRate: number;
  newTotalInstallments: number;
  refinancingFees: number; // Gastos de reestructuración capitalizados

  reason: string; // ej. Rediferido de tarjeta a 24 meses, Alivio financiero
  approvedByInstitutionDate?: string;
  createdAt: string;
}

/**
 * H. Ingresos del Período
 */
export interface Income {
  id: string;
  userId: string;
  accountId?: string; // Cuenta donde se depositó
  periodYear: number;
  periodMonth: number;
  sourceName: string; // ej. Salario, Honorarios, Rendimientos
  amount: number;
  receivedDate: string;
  idempotencyKey?: string;
  isReversed?: boolean;
  reversedAt?: string;
  reversalReason?: string;
  notes?: string;
  createdAt: string;
}

/**
 * I. Transferencias Propias Neutras
 */
export interface InternalAccountTransfer {
  id: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  feeAmount: number; // Comisión interbancaria (gasto si aplica)
  transferDate: string;
  idempotencyKey?: string;
  isReversed?: boolean;
  reversedAt?: string;
  reversalReason?: string;
  notes?: string;
  createdAt: string;
}

/**
 * J. Log de Auditoría Financiera
 */
export interface FinancialAuditLogEntry {
  id: string;
  userId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  amount?: number;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * K. Estado y Métricas Consolidadas del Mes
 * Distinción nítida entre saldo exigible, capital pendiente, intereses causados y patrimonio.
 */
export interface MonthlyLedgerSummaryV2 {
  periodYear: number;
  periodMonth: number;

  // Flujo del Mes
  totalIncome: number; // Columna A del Excel (Ingresos del período)
  totalObligations: number; // Columna C del Excel (Total deducciones/cuotas exigibles del mes)
  totalPaid: number; // Columna G del Excel (Pagado en el período)
  totalPending: number; // Columna H del Excel (Saldo exigible pendiente del período)
  totalFree: number; // Columna E del Excel (Libre = Ingresos - Obligaciones)

  // Desglose de cuotas exigibles del mes
  totalCapitalPayable: number;
  totalInterestPayable: number;
  totalInsurancePayable: number;

  // Liquidez y Patrimonio
  realLiquidBalance: number; // Saldo real en cuentas de ahorro, corriente, efectivo y billeteras
  projectedLiquidBalance: number; // Saldo real - totalPending (liquidez proyectada tras pagar lo pendiente del mes)
  activePrincipalDebt: number; // Saldo de capital adeudado actual en todos los créditos activos
  periodAccruedInterest: number; // Intereses corrientes facturados en el período
  totalDebtBalance: number; // Saldo total de deuda actual (Capital vigente + Intereses devengados exigibles)
  netWorth: number; // Activos líquidos - Pasivos totales (realLiquidBalance - totalDebtBalance)

  // Indicadores de completitud contable
  isDebtCalculationDefinitive: boolean; // True si los pasivos cuentan con liquidación completa; false si es estimación de capital
  debtNotes: string; // Explicación transparente de las cifras consideradas
}
