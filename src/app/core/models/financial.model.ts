/**
 * Tipos de cuenta financiera según el sistema contable
 */
export type AccountType = 'SAVINGS' | 'CHECKING' | 'CASH' | 'CREDIT_CARD';

/**
 * Entidad de Cuenta Financiera (ej. Banco de Occidente, Efectivo, RappiPay)
 */
export interface FinancialAccount {
  id: string;
  userId: string;
  name: string;
  accountType: AccountType;
  initialBalance: number;
  currentBalance: number;
  color?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Categorías de flujo de caja
 */
export interface FinancialCategory {
  id: string;
  userId: string;
  name: string;
  icon?: string;
  color?: string;
  isSystem: boolean;
  createdAt: string;
}

/**
 * Estado explícito de una obligación mensual
 * (Reemplaza los colores VBA SumarPorColor)
 */
export type ObligationStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';

/**
 * Registro de Ingreso en el período
 */
export interface Income {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  description: string;
  receivedDate: string;
  periodYear: number;
  periodMonth: number;
  createdAt: string;
}

/**
 * Obligación / Deducción programada para el período
 */
export interface Obligation {
  id: string;
  userId: string;
  name: string;
  amount: number;
  dueDate?: string;
  periodYear: number;
  periodMonth: number;
  status: ObligationStatus;
  amountPaid: number;
  amountPending: number;
  orderIndex: number;
  categoryId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pago efectuado hacia una obligación específica
 */
export interface ObligationPayment {
  id: string;
  userId: string;
  obligationId: string;
  accountId: string;
  amount: number;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

/**
 * Estado general del período mensual calculado
 */
export interface MonthlyLedgerSummary {
  periodYear: number;
  periodMonth: number;
  totalIncome: number;
  totalObligations: number;
  totalPaid: number;
  totalPending: number;
  totalFree: number;
  realBalance: number;
  projectedBalance: number;
}
