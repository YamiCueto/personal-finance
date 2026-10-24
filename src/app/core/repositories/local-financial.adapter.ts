import { Injectable } from '@angular/core';
import { DebtHistory, DebtReconciliation, ExistingDebtInput, ReconcileDebtInput, validDate, validateExistingDebt } from '../models/debt-tracking.model';
import { allocatePaymentCascade, trackedInstallment } from '../services/debt-history';
import {
  AccountHistorySummary,
  DeleteAccountOptions,
  FinancialAccount,
  FinancialAccountDeletionAudit,
  FinancialAuditLogEntry,
  FinancialInstitution,
  CreditProduct,
  PeriodObligation,
  Income,
  ObligationPayment,
  InternalAccountTransfer,
  CreditCardPurchase,
} from '../models/financial-v2.model';
import {
  CreateAccountDTO,
  CreateCreditProductDTO,
  CreateCreditCardPurchaseDTO,
  GenerateInstallmentDTO,
  CreateIncomeDTO,
  CreateObligationDTO,
  FinancialOperationResult,
  ICreditProductRepository,
  IFinancialAccountRepository,
  IIncomeRepository,
  IPeriodObligationRepository,
  ITransactionalOperationRepository,
  RecordPaymentDTO,
  RecordRestructureDTO,
  RecordTransferDTO,
  ReverseOperationDTO,
} from './financial-repositories.contract';
import { FinancialCalculatorV2 } from '../services/financial-calculator-v2';

/**
 * Adaptador Financiero Local en Memoria.
 *
 * Propósito:
 * - Proveer un entorno determinista, seguro y aislado para desarrollo y pruebas locales.
 * - Utilizar exclusivamente datos ficticios sin conectarse a Supabase remoto ni persistir datos sensibles.
 * - Mantener aislamiento estricto por `userId`.
 * - Reutilizar el motor de cálculo exacto `FinancialCalculatorV2` para mantener las mismas invariantes contables que PostgreSQL.
 *
 * AVISO: Este adaptador local NO sustituye la validación de concurrencia de red ni las políticas RLS reales de PostgreSQL.
 */
@Injectable({
  providedIn: 'root',
})
export class LocalFinancialAdapter
  implements
    IFinancialAccountRepository,
    ICreditProductRepository,
    IPeriodObligationRepository,
    IIncomeRepository,
    ITransactionalOperationRepository
{
  // Almacén en memoria indexado por usuario
  private institutionsMap = new Map<string, FinancialInstitution[]>();
  private accountsMap = new Map<string, FinancialAccount[]>();
  private creditProductsMap = new Map<string, CreditProduct[]>();
  private periodObligationsMap = new Map<string, PeriodObligation[]>();
  private incomesMap = new Map<string, Income[]>();
  private paymentsMap = new Map<string, ObligationPayment[]>();
  private transfersMap = new Map<string, InternalAccountTransfer[]>();
  private creditCardPurchasesMap = new Map<string, CreditCardPurchase[]>();
  private reconciliationsMap = new Map<string, DebtReconciliation[]>();
  private debtRegistrations = new Map<string, { payload: string; product: CreditProduct }>();
  private accountAuditMap = new Map<string, FinancialAuditLogEntry[]>();
  private deletionAuditMap = new Map<string, FinancialAccountDeletionAudit[]>();
  private accountLocks = new Set<string>();

  // Caché de idempotencia en memoria: user_id:key -> FinancialOperationResult
  private idempotencyStore = new Map<string, { result: FinancialOperationResult; payload: any }>();

  // Caché de idempotencia para compras de tarjeta (tipo distinto a FinancialOperationResult)
  private purchaseIdempotencyStore = new Map<string, { result: CreditCardPurchase; payload: { amount: number; creditCardId: string; totalInstallments: number } }>();

  constructor() {
    this.seedDefaultUserData('default-user');
  }

  /**
   * Inicializa o reinicia el almacén con datos ficticios para un usuario específico.
   */
  public seedDefaultUserData(userId: string): void {
    const now = new Date().toISOString();

    const inst1: FinancialInstitution = {
      id: 'inst-banco-occidente',
      userId,
      name: 'Banco de Occidente',
      type: 'BANK',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const inst2: FinancialInstitution = {
      id: 'inst-nequi',
      userId,
      name: 'Nequi Colombia',
      type: 'FINTECH',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.institutionsMap.set(userId, [inst1, inst2]);

    const acc1: FinancialAccount = {
      id: 'acc-ahorros-principal',
      userId,
      institutionId: inst1.id,
      name: 'Cuenta Principal Ahorros',
      type: 'SAVINGS',
      currency: 'COP',
      initialBalance: 4500000.0,
      currentBalance: 4500000.0,
      isArchived: false,
      color: '#0284c7',
      createdAt: now,
      updatedAt: now,
    };
    const acc2: FinancialAccount = {
      id: 'acc-nequi-billetera',
      userId,
      institutionId: inst2.id,
      name: 'Billetera Digital Nequi',
      type: 'DIGITAL_WALLET',
      currency: 'COP',
      initialBalance: 750000.0,
      currentBalance: 750000.0,
      isArchived: false,
      color: '#ec4899',
      createdAt: now,
      updatedAt: now,
    };
    this.accountsMap.set(userId, [acc1, acc2]);

    // Crédito A: Tasa positiva, plazo definido y amortización francesa
    const credit1: CreditProduct = {
      id: 'credit-vehiculo-01',
      userId,
      institutionId: inst1.id,
      name: 'Crédito Vehículo Occidente',
      type: 'VEHICLE_LOAN',
      status: 'ACTIVE',
      originalPrincipal: 40000000.0,
      currentPrincipalBalance: 32000000.0,
      nominalRateMonthly: 1.45,
      effectiveAnnualRate: 18.86,
      totalInstallments: 60,
      remainingInstallments: 48,
      capitalizationPeriod: 'MONTHLY',
      amortizationMethod: 'FRENCH',
      associatedInsurancesMonthly: 45000.0,
      managementFeeMonthly: 0.0,
      paymentDueDay: 15,
      createdAt: now,
      updatedAt: now,
    };

    // Crédito B: Tasa cero para comprobar casos límite
    const credit2: CreditProduct = {
      id: 'credit-educativo-02',
      userId,
      institutionId: inst1.id,
      name: 'Crédito Educativo Convenio 0%',
      type: 'CONSUMER_LOAN',
      status: 'ACTIVE',
      originalPrincipal: 6000000.0,
      currentPrincipalBalance: 4000000.0,
      nominalRateMonthly: 0.0,
      effectiveAnnualRate: 0.0,
      totalInstallments: 12,
      remainingInstallments: 8,
      capitalizationPeriod: 'MONTHLY',
      amortizationMethod: 'FRENCH',
      associatedInsurancesMonthly: 0.0,
      managementFeeMonthly: 0.0,
      paymentDueDay: 20,
      createdAt: now,
      updatedAt: now,
    };

    // Tarjeta A: Varias compras con diferentes cuotas
    const card1: CreditProduct = {
      id: 'card-visa-platinum-01',
      userId,
      institutionId: inst1.id,
      name: 'Tarjeta Visa Platinum',
      type: 'CREDIT_CARD',
      status: 'ACTIVE',
      approvedCreditLimit: 10000000.0,
      usedCreditLimit: 4850000.0,
      availableCreditLimit: 5150000.0,
      originalPrincipal: 6450000.0,
      currentPrincipalBalance: 4850000.0,
      nominalRateMonthly: 2.15,
      effectiveAnnualRate: 29.12,
      statementCutoffDay: 18,
      paymentDueDay: 5,
      capitalizationPeriod: 'MONTHLY',
      associatedInsurancesMonthly: 0.0,
      managementFeeMonthly: 28500.0,
      amortizationMethod: 'FRENCH',
      createdAt: now,
      updatedAt: now,
    };

    // Tarjeta B: Cupo parcialmente utilizado
    const card2: CreditProduct = {
      id: 'card-mastercard-black-02',
      userId,
      institutionId: inst2.id,
      name: 'Tarjeta Mastercard Black',
      type: 'CREDIT_CARD',
      status: 'ACTIVE',
      approvedCreditLimit: 15000000.0,
      usedCreditLimit: 2666666.67,
      availableCreditLimit: 12333333.33,
      originalPrincipal: 3200000.0,
      currentPrincipalBalance: 2666666.67,
      nominalRateMonthly: 2.05,
      effectiveAnnualRate: 27.53,
      statementCutoffDay: 25,
      paymentDueDay: 12,
      capitalizationPeriod: 'MONTHLY',
      associatedInsurancesMonthly: 0.0,
      managementFeeMonthly: 35000.0,
      amortizationMethod: 'FRENCH',
      createdAt: now,
      updatedAt: now,
    };

    this.creditProductsMap.set(userId, [credit1, credit2, card1, card2]);

    const initialPurchases: CreditCardPurchase[] = [
      {
        id: 'pur-macbook-01',
        productId: card1.id,
        userId,
        purchaseDate: '2026-01-15',
        description: 'MacBook Pro Trabajo',
        originalAmount: 4800000.0,
        totalInstallments: 24,
        remainingInstallments: 18,
        interestRateMonthly: 2.15,
        monthlyCapital: 200000.0,
        monthlyInterest: 103200.0,
        status: 'PENDING',
        createdAt: now,
      },
      {
        id: 'pur-supermercado-02',
        productId: card1.id,
        userId,
        purchaseDate: '2026-05-02',
        description: 'Mercado Mensual Supermercado',
        originalAmount: 450000.0,
        totalInstallments: 1,
        remainingInstallments: 1,
        interestRateMonthly: 0.0,
        monthlyCapital: 450000.0,
        monthlyInterest: 0.0,
        status: 'PENDING',
        createdAt: now,
      },
      {
        id: 'pur-certificacion-03',
        productId: card1.id,
        userId,
        purchaseDate: '2026-03-10',
        description: 'Curso Certificación Cloud',
        originalAmount: 1200000.0,
        totalInstallments: 6,
        remainingInstallments: 4,
        interestRateMonthly: 2.15,
        monthlyCapital: 200000.0,
        monthlyInterest: 25800.0,
        status: 'PENDING',
        createdAt: now,
      },
      {
        id: 'pur-vuelos-04',
        productId: card2.id,
        userId,
        purchaseDate: '2026-02-20',
        description: 'Tiquetes Aéreos Congreso',
        originalAmount: 3200000.0,
        totalInstallments: 12,
        remainingInstallments: 10,
        interestRateMonthly: 2.05,
        monthlyCapital: 266666.67,
        monthlyInterest: 65600.0,
        status: 'PENDING',
        createdAt: now,
      },
    ];
    this.creditCardPurchasesMap.set(userId, initialPurchases);

    // 1. Semilla de compatibilidad fija para pruebas y regresión en 2026-05
    const ob1_2026: PeriodObligation = {
      id: 'ob-cuota-vehiculo-mayo',
      userId,
      creditProductId: credit1.id,
      sourceType: 'CREDIT_INSTALLMENT',
      periodYear: 2026,
      periodMonth: 5,
      name: 'Cuota Crédito Vehículo (Mayo)',
      amount: 980000.0,
      amountPaid: 0.0,
      amountPending: 980000.0,
      status: 'PENDING',
      orderIndex: 1,
      capitalComponent: 520000.0,
      interestCurrentComponent: 415000.0,
      interestMoraComponent: 0.0,
      insuranceComponent: 45000.0,
      otherFeesComponent: 0.0,
      createdAt: now,
      updatedAt: now,
    };
    const ob2_2026: PeriodObligation = {
      id: 'ob-servicios-internet',
      userId,
      sourceType: 'RECURRENT_EXPENSE',
      periodYear: 2026,
      periodMonth: 5,
      name: 'Fibra Óptica Claro',
      amount: 145000.0,
      amountPaid: 0.0,
      amountPending: 145000.0,
      status: 'PENDING',
      orderIndex: 2,
      capitalComponent: 145000.0,
      interestCurrentComponent: 0.0,
      interestMoraComponent: 0.0,
      insuranceComponent: 0.0,
      otherFeesComponent: 0.0,
      createdAt: now,
      updatedAt: now,
    };
    const inc1_2026: Income = {
      id: 'inc-salario-mayo',
      userId,
      accountId: acc1.id,
      periodYear: 2026,
      periodMonth: 5,
      sourceName: 'Salario Nómina Mayo',
      amount: 5800000.0,
      receivedDate: '2026-05-15',
      isReversed: false,
      createdAt: now,
    };

    const allObs: PeriodObligation[] = [ob1_2026, ob2_2026];
    const allIncs: Income[] = [inc1_2026];
    const allPays: ObligationPayment[] = [];

    // 2. Si el mes actual del sistema difiere de 2026-05, sembrar el escenario dinámico Sprint 2 / Fase 2
    const currentDate = new Date();
    const currentY = currentDate.getFullYear();
    const currentM = currentDate.getMonth() + 1;

    if (currentY !== 2026 || currentM !== 5) {
      const yStr = currentY.toString();
      const mStr = currentM.toString().padStart(2, '0');

      const incCurrent: Income = {
        id: `inc-salario-${currentY}-${currentM}`,
        userId,
        accountId: acc1.id,
        periodYear: currentY,
        periodMonth: currentM,
        sourceName: `Salario Nómina ${mStr}/${yStr}`,
        amount: 5800000.0,
        receivedDate: `${yStr}-${mStr}-15`,
        isReversed: false,
        createdAt: now,
      };
      allIncs.push(incCurrent);

      // Obligación 1: Pago parcial
      const obCurrent1: PeriodObligation = {
        id: `ob-cuota-vehiculo-${currentY}-${currentM}`,
        userId,
        creditProductId: credit1.id,
        sourceType: 'CREDIT_INSTALLMENT',
        periodYear: currentY,
        periodMonth: currentM,
        name: `Cuota Crédito Vehículo (${mStr}/${yStr})`,
        amount: 980000.0,
        amountPaid: 350000.0,
        amountPending: 630000.0,
        status: 'PARTIAL',
        orderIndex: 1,
        capitalComponent: 520000.0,
        interestCurrentComponent: 415000.0,
        interestMoraComponent: 0.0,
        insuranceComponent: 45000.0,
        otherFeesComponent: 0.0,
        createdAt: now,
        updatedAt: now,
      };

      const payCurrent1: ObligationPayment = {
        id: `pay-cuota-parcial-${currentY}-${currentM}`,
        userId,
        obligationId: obCurrent1.id,
        accountId: acc1.id,
        amount: 350000.0,
        paymentType: 'PARTIAL_PAYMENT',
        paymentDate: `${yStr}-${mStr}-05`,
        appliedToCapital: 200000.0,
        appliedToInterest: 150000.0,
        appliedToInsurance: 0.0,
        appliedToFees: 0.0,
        isReversed: false,
        notes: 'Pago parcial abonado a cuota',
        createdAt: now,
      };

      // Obligación 2: Pago completo
      const obCurrent2: PeriodObligation = {
        id: `ob-servicios-internet-${currentY}-${currentM}`,
        userId,
        sourceType: 'RECURRENT_EXPENSE',
        periodYear: currentY,
        periodMonth: currentM,
        name: 'Fibra Óptica Claro',
        amount: 145000.0,
        amountPaid: 145000.0,
        amountPending: 0.0,
        status: 'PAID',
        orderIndex: 2,
        capitalComponent: 145000.0,
        interestCurrentComponent: 0.0,
        interestMoraComponent: 0.0,
        insuranceComponent: 0.0,
        otherFeesComponent: 0.0,
        createdAt: now,
        updatedAt: now,
      };

      const payCurrent2: ObligationPayment = {
        id: `pay-fibra-completo-${currentY}-${currentM}`,
        userId,
        obligationId: obCurrent2.id,
        accountId: acc2.id,
        amount: 145000.0,
        paymentType: 'FULL_PAYMENT',
        paymentDate: `${yStr}-${mStr}-08`,
        appliedToCapital: 145000.0,
        appliedToInterest: 0.0,
        appliedToInsurance: 0.0,
        appliedToFees: 0.0,
        isReversed: false,
        notes: 'Pago total del mes',
        createdAt: now,
      };

      // Obligación 3: Pendiente
      const obCurrent3: PeriodObligation = {
        id: `ob-seguro-vida-${currentY}-${currentM}`,
        userId,
        sourceType: 'RECURRENT_EXPENSE',
        periodYear: currentY,
        periodMonth: currentM,
        name: 'Seguro de Vida y Accidentes',
        amount: 180000.0,
        amountPaid: 0.0,
        amountPending: 180000.0,
        status: 'PENDING',
        orderIndex: 3,
        capitalComponent: 180000.0,
        interestCurrentComponent: 0.0,
        interestMoraComponent: 0.0,
        insuranceComponent: 0.0,
        otherFeesComponent: 0.0,
        createdAt: now,
        updatedAt: now,
      };

      allObs.push(obCurrent1, obCurrent2, obCurrent3);
      allPays.push(payCurrent1, payCurrent2);
    }

    this.periodObligationsMap.set(userId, allObs);
    this.incomesMap.set(userId, allIncs);
    this.paymentsMap.set(userId, allPays);
    this.transfersMap.set(userId, []);
  }

  public resetAll(): void {
    this.reconciliationsMap.clear();
    this.debtRegistrations.clear();
    this.accountAuditMap.clear();
    this.deletionAuditMap.clear();
    this.accountLocks.clear();
    this.institutionsMap.clear();
    this.accountsMap.clear();
    this.creditProductsMap.clear();
    this.creditCardPurchasesMap.clear();
    this.periodObligationsMap.clear();
    this.incomesMap.clear();
    this.paymentsMap.clear();
    this.transfersMap.clear();
    this.idempotencyStore.clear();
  }

  public resetUserScenario(userId: string): void {
    this.reconciliationsMap.delete(userId);
    this.accountAuditMap.delete(userId);
    this.deletionAuditMap.delete(userId);
    for (const key of this.debtRegistrations.keys()) if (key.startsWith(`${userId}:`)) this.debtRegistrations.delete(key);
    this.institutionsMap.delete(userId);
    this.accountsMap.delete(userId);
    this.creditProductsMap.delete(userId);
    this.creditCardPurchasesMap.delete(userId);
    this.periodObligationsMap.delete(userId);
    this.incomesMap.delete(userId);
    this.paymentsMap.delete(userId);
    this.transfersMap.delete(userId);
    // Limpiar claves de idempotencia de este usuario
    for (const key of this.idempotencyStore.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.idempotencyStore.delete(key);
      }
    }
    this.seedDefaultUserData(userId);
  }

  private ensureUserInitialized(userId: string): void {
    if (userId.startsWith('empty-')) {
      return;
    }
    if (!this.accountsMap.has(userId)) {
      this.seedDefaultUserData(userId);
    }
  }

  // --- REPOSITORIO DE CUENTAS ---

  async getInstitutions(userId: string): Promise<FinancialInstitution[]> {
    this.ensureUserInitialized(userId);
    return [...(this.institutionsMap.get(userId) || [])];
  }

  async createInstitution(userId: string, name: string, type: FinancialInstitution['type']): Promise<FinancialInstitution> {
    this.ensureUserInitialized(userId);
    const list = this.institutionsMap.get(userId) || [];
    const inst: FinancialInstitution = {
      id: 'inst-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId,
      name: name.trim(),
      type,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.institutionsMap.set(userId, [...list, inst]);
    return inst;
  }

  async getAccounts(userId: string): Promise<FinancialAccount[]> {
    this.ensureUserInitialized(userId);
    return [...(this.accountsMap.get(userId) || [])];
  }

  async getAccountById(userId: string, accountId: string): Promise<FinancialAccount | null> {
    this.ensureUserInitialized(userId);
    const list = this.accountsMap.get(userId) || [];
    return list.find((a) => a.id === accountId) || null;
  }

  async createAccount(userId: string, dto: CreateAccountDTO): Promise<FinancialAccount> {
    this.ensureUserInitialized(userId);
    if (!dto.name || dto.name.trim() === '') {
      throw new Error('El nombre de la cuenta es obligatorio');
    }
    if (dto.initialBalance < 0) {
      throw new Error('El saldo inicial no puede ser negativo');
    }

    const list = this.accountsMap.get(userId) || [];
    const acc: FinancialAccount = {
      id: 'acc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId,
      institutionId: dto.institutionId,
      name: dto.name.trim(),
      type: dto.type,
      currency: 'COP',
      initialBalance: dto.initialBalance,
      currentBalance: dto.initialBalance,
      statementCutoffDay: dto.statementCutoffDay,
      color: dto.color || '#3b82f6',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.accountsMap.set(userId, [...list, acc]);
    return acc;
  }

  async archiveAccount(userId: string, accountId: string, idempotencyKey?: string): Promise<void> {
    this.ensureUserInitialized(userId);
    const lockKey = `${userId}:archive:${accountId}`;
    if (this.accountLocks.has(lockKey)) {
      throw new Error('Operación sobre la cuenta en curso.');
    }
    this.accountLocks.add(lockKey);
    try {
      const list = this.accountsMap.get(userId) || [];
      const target = list.find((a) => a.id === accountId);
      if (!target || target.userId !== userId) {
        throw new Error('Cuenta no encontrada o no pertenece al usuario');
      }
      const normalizedKey = idempotencyKey?.trim() || undefined;
      const audits = this.accountAuditMap.get(userId) || [];
      if (normalizedKey) {
        const existing = audits.find((e) => e.idempotencyKey === normalizedKey);
        if (existing) {
          if (existing.entityId !== accountId || existing.eventType !== 'ACCOUNT_ARCHIVED') {
            throw new Error(`Conflicto de idempotencia: la clave ${normalizedKey} ya fue utilizada en otra operación.`);
          }
          return;
        }
      }
      if (target.isArchived) {
        return;
      }
      const now = new Date().toISOString();
      target.isArchived = true;
      target.updatedAt = now;
      const entry: FinancialAuditLogEntry = {
        id: crypto.randomUUID(),
        userId,
        eventType: 'ACCOUNT_ARCHIVED',
        entityType: 'accounts',
        entityId: target.id,
        amount: target.currentBalance,
        idempotencyKey: normalizedKey,
        payload: {
          account_id: target.id,
          account_name: target.name,
          performed_by: userId,
          operation: 'ACCOUNT_ARCHIVED',
          previous_state: { is_archived: false },
          new_state: { is_archived: true },
          recorded_at: now,
          simulated_local: true,
        },
        createdAt: now,
        isSimulatedLocal: true,
      };
      this.accountAuditMap.set(userId, [entry, ...audits]);
    } finally {
      this.accountLocks.delete(lockKey);
    }
  }

  async restoreAccount(userId: string, accountId: string, idempotencyKey?: string): Promise<void> {
    this.ensureUserInitialized(userId);
    const lockKey = `${userId}:restore:${accountId}`;
    if (this.accountLocks.has(lockKey)) {
      throw new Error('Operación sobre la cuenta en curso.');
    }
    this.accountLocks.add(lockKey);
    try {
      const list = this.accountsMap.get(userId) || [];
      const target = list.find((a) => a.id === accountId);
      if (!target || target.userId !== userId) {
        throw new Error('Cuenta no encontrada o no pertenece al usuario');
      }
      const normalizedKey = idempotencyKey?.trim() || undefined;
      const audits = this.accountAuditMap.get(userId) || [];
      if (normalizedKey) {
        const existing = audits.find((e) => e.idempotencyKey === normalizedKey);
        if (existing) {
          if (existing.entityId !== accountId || existing.eventType !== 'ACCOUNT_RESTORED') {
            throw new Error(`Conflicto de idempotencia: la clave ${normalizedKey} ya fue utilizada en otra operación.`);
          }
          return;
        }
      }
      if (!target.isArchived) {
        return;
      }
      const now = new Date().toISOString();
      target.isArchived = false;
      target.updatedAt = now;
      const entry: FinancialAuditLogEntry = {
        id: crypto.randomUUID(),
        userId,
        eventType: 'ACCOUNT_RESTORED',
        entityType: 'accounts',
        entityId: target.id,
        amount: target.currentBalance,
        idempotencyKey: normalizedKey,
        payload: {
          account_id: target.id,
          account_name: target.name,
          performed_by: userId,
          operation: 'ACCOUNT_RESTORED',
          previous_state: { is_archived: true },
          new_state: { is_archived: false },
          recorded_at: now,
          simulated_local: true,
        },
        createdAt: now,
        isSimulatedLocal: true,
      };
      this.accountAuditMap.set(userId, [entry, ...audits]);
    } finally {
      this.accountLocks.delete(lockKey);
    }
  }

  async deleteAccount(userId: string, accountId: string, options?: DeleteAccountOptions): Promise<void> {
    this.ensureUserInitialized(userId);
    const lockKey = `${userId}:delete:${accountId}`;
    if (this.accountLocks.has(lockKey)) {
      throw new Error('Operación sobre la cuenta en curso.');
    }
    this.accountLocks.add(lockKey);
    try {
      const accounts = this.accountsMap.get(userId) || [];
      const target = accounts.find((account) => account.id === accountId);
      if (!target || target.userId !== userId) {
        throw new Error('Cuenta no encontrada o no pertenece al usuario');
      }
      const hasHistory = (this.incomesMap.get(userId) || []).some((item) => item.accountId === accountId)
        || (this.paymentsMap.get(userId) || []).some((item) => item.accountId === accountId)
        || (this.transfersMap.get(userId) || []).some((item) => item.fromAccountId === accountId || item.toAccountId === accountId);
      if (hasHistory) {
        throw new Error('La cuenta tiene historial financiero y no puede eliminarse.');
      }
      const operationId = options?.operationId?.trim() || crypto.randomUUID();
      const existingDeletions = this.deletionAuditMap.get(userId) || [];
      if (existingDeletions.some((d) => d.operationId === operationId)) {
        throw new Error('El identificador de operación ya fue registrado en auditoría.');
      }
      const now = new Date().toISOString();
      const reason = options?.reason?.trim() || undefined;
      const deletionAudit: FinancialAccountDeletionAudit = {
        id: crypto.randomUUID(),
        accountId: target.id,
        accountName: target.name,
        institutionId: target.institutionId,
        accountType: target.type,
        ownerUserId: target.userId,
        deletedBy: userId,
        deletedAt: now,
        deletionReason: reason,
        operationId,
        metadata: {
          rpc: 'local_demo_delete_account',
          operation_type: 'ACCOUNT_DELETED',
          result: 'SUCCESS',
          verified_origin: 'No disponible',
          client_supplied_origin_trusted: false,
          simulated_local: true,
          previous_state: {
            is_archived: target.isArchived,
            initial_balance: target.initialBalance,
            current_balance: target.currentBalance,
            currency: target.currency,
          },
          new_state: 'DELETED',
        },
        isSimulatedLocal: true,
      };
      const logEntry: FinancialAuditLogEntry = {
        id: crypto.randomUUID(),
        userId,
        eventType: 'ACCOUNT_DELETED',
        entityType: 'accounts',
        entityId: target.id,
        amount: target.currentBalance,
        idempotencyKey: operationId,
        payload: {
          account_id: target.id,
          account_name: target.name,
          account_type: target.type,
          institution_id: target.institutionId,
          owner_user_id: target.userId,
          deleted_by: userId,
          operation: 'ACCOUNT_DELETED',
          operation_id: operationId,
          deletion_audit_id: deletionAudit.id,
          deletion_reason: reason,
          previous_state: { is_archived: target.isArchived, exists: true },
          new_state: { is_archived: false, exists: false },
          recorded_at: now,
          simulated_local: true,
        },
        createdAt: now,
        isSimulatedLocal: true,
      };
      this.deletionAuditMap.set(userId, [deletionAudit, ...existingDeletions]);
      this.accountAuditMap.set(userId, [logEntry, ...(this.accountAuditMap.get(userId) || [])]);
      this.accountsMap.set(userId, accounts.filter((account) => account.id !== accountId));
    } finally {
      this.accountLocks.delete(lockKey);
    }
  }

  async getAccountHistory(userId: string, accountId: string): Promise<AccountHistorySummary> {
    this.ensureUserInitialized(userId);
    const accounts = this.accountsMap.get(userId) || [];
    const deletions = this.deletionAuditMap.get(userId) || [];
    if (!accounts.some((a) => a.id === accountId) && !deletions.some((d) => d.accountId === accountId)) {
      throw new Error('Cuenta no encontrada o no pertenece al usuario');
    }
    return {
      accountId,
      incomes: (this.incomesMap.get(userId) || []).filter((i) => i.accountId === accountId),
      payments: (this.paymentsMap.get(userId) || []).filter((p) => p.accountId === accountId),
      transfers: (this.transfersMap.get(userId) || []).filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId),
      auditTrail: (this.accountAuditMap.get(userId) || []).filter((e) => e.entityId === accountId),
    };
  }

  async getAccountDeletionAudit(userId: string): Promise<FinancialAccountDeletionAudit[]> {
    this.ensureUserInitialized(userId);
    return [...(this.deletionAuditMap.get(userId) || [])];
  }

  async getAccountAuditTrail(userId: string, accountId?: string): Promise<FinancialAuditLogEntry[]> {
    this.ensureUserInitialized(userId);
    const list = this.accountAuditMap.get(userId) || [];
    return accountId ? list.filter((e) => e.entityId === accountId) : [...list];
  }

  // --- REPOSITORIO DE CRÉDITOS ---

  async getCreditProducts(userId: string): Promise<CreditProduct[]> {
    this.ensureUserInitialized(userId);
    return [...(this.creditProductsMap.get(userId) || [])];
  }

  async registerExistingDebt(userId: string, dto: ExistingDebtInput): Promise<CreditProduct> {
    validateExistingDebt(dto);
    this.ensureUserInitialized(userId);
    const key = `${userId}:${dto.idempotencyKey}`;
    const previous = this.debtRegistrations.get(key);
    if (previous) {
      if (previous.payload !== JSON.stringify(dto)) throw new Error('Conflicto de idempotencia.');
      return previous.product;
    }
    if (!(this.institutionsMap.get(userId) || []).some(i => i.id === dto.institutionId)) throw new Error('Entidad no encontrada o no pertenece al usuario.');
    const now = new Date().toISOString();
    const product: CreditProduct = {
      id: crypto.randomUUID(), userId, institutionId: dto.institutionId, name: dto.name.trim(), type: dto.type,
      status: 'ACTIVE', originalPrincipal: null, currentPrincipalBalance: dto.openingPrincipalBalance,
      openingPrincipalBalance: dto.openingPrincipalBalance, trackingStartDate: dto.trackingStartDate,
      nextDueDate: dto.nextDueDate, agreedInstallment: dto.agreedInstallment, knownInterestMonthly: dto.knownInterestMonthly,
      obligationKind: dto.obligationKind, remainingInstallments: dto.remainingInstallments,
      interestRateKnown: dto.nominalRateMonthly !== undefined,
      nominalRateMonthly: dto.nominalRateMonthly ?? 0, effectiveAnnualRate: FinancialCalculatorV2.convertNmvToEa(dto.nominalRateMonthly ?? 0),
      capitalizationPeriod: 'MONTHLY', amortizationMethod: 'FIXED_INSTALLMENT', associatedInsurancesMonthly: dto.insuranceMonthly,
      managementFeeMonthly: dto.feesMonthly, notes: dto.notes, paymentDueDay: Number(dto.nextDueDate.slice(8)), createdAt: now, updatedAt: now,
    };
    this.creditProductsMap.set(userId, [...(this.creditProductsMap.get(userId) || []), product]);
    this.debtRegistrations.set(key, { payload: JSON.stringify(dto), product });
    return product;
  }

  async getDebtHistory(userId: string, creditId: string): Promise<DebtHistory> {
    if (!(this.creditProductsMap.get(userId) || []).some(p => p.id === creditId)) throw new Error('Deuda no encontrada.');
    const obligations = (this.periodObligationsMap.get(userId) || []).filter(o => o.creditProductId === creditId);
    return structuredClone({ obligations, payments: (this.paymentsMap.get(userId) || []).filter(p => obligations.some(o => o.id === p.obligationId)), reconciliations: (this.reconciliationsMap.get(userId) || []).filter(r => r.creditProductId === creditId) });
  }

  async reconcileDebt(userId: string, dto: ReconcileDebtInput): Promise<DebtReconciliation> {
    const product = (this.creditProductsMap.get(userId) || []).find(p => p.id === dto.creditProductId);
    if (!product?.trackingStartDate) throw new Error('Deuda con seguimiento no encontrada.');
    const list = this.reconciliationsMap.get(userId) || [];
    const existing = list.find(r => r.idempotencyKey === dto.idempotencyKey);
    if (existing) {
      if (existing.creditProductId !== dto.creditProductId || existing.reportedBalance !== dto.reportedBalance || existing.statementDate !== dto.statementDate || existing.reason !== dto.reason.trim()) throw new Error('Conflicto de idempotencia.');
      return existing;
    }
    if (!dto.reason.trim() || !dto.idempotencyKey || !validDate(dto.statementDate) || !Number.isFinite(dto.reportedBalance) || dto.reportedBalance < 0) throw new Error('Completa la fecha, el saldo y el motivo de conciliación.');
    const ids = (this.periodObligationsMap.get(userId) || []).filter(o => o.creditProductId === product.id).map(o => o.id);
    const latest = [product.trackingStartDate, ...list.filter(r => r.creditProductId === product.id).map(r => r.statementDate), ...(this.paymentsMap.get(userId) || []).filter(p => ids.includes(p.obligationId)).flatMap(p => [p.paymentDate, p.reversedAt?.slice(0, 10) || p.paymentDate])].sort().at(-1)!;
    if (dto.statementDate < latest) throw new Error('La fecha del extracto debe incluir los movimientos registrados.');
    if (dto.expectedBalance !== product.currentPrincipalBalance) throw new Error('El saldo cambió. Actualiza el detalle antes de conciliar.');
    const record: DebtReconciliation = { ...dto, id: crypto.randomUUID(), userId, reason: dto.reason.trim(), calculatedBalance: product.currentPrincipalBalance, difference: FinancialCalculatorV2.fromCents(FinancialCalculatorV2.toCents(dto.reportedBalance) - FinancialCalculatorV2.toCents(product.currentPrincipalBalance)), createdAt: new Date().toISOString() };
    product.currentPrincipalBalance = dto.reportedBalance;
    product.status = dto.reportedBalance === 0 ? 'PAID_OFF' : 'ACTIVE';
    this.reconciliationsMap.set(userId, [...list, record]);
    return record;
  }

  async getCreditProductById(userId: string, creditId: string): Promise<CreditProduct | null> {
    const list = this.creditProductsMap.get(userId) || [];
    return list.find((c) => c.id === creditId) || null;
  }

  async createCreditProduct(userId: string, dto: CreateCreditProductDTO): Promise<CreditProduct> {
    this.ensureUserInitialized(userId);
    if (!dto.name || dto.name.trim() === '') {
      throw new Error('El nombre del producto de crédito es obligatorio');
    }
    if (dto.nominalRateMonthly < 0 || dto.effectiveAnnualRate < 0) {
      throw new Error('Las tasas de interés no pueden ser negativas');
    }

    const isCard = dto.type === 'CREDIT_CARD';
    if (isCard) {
      if (!dto.approvedCreditLimit || dto.approvedCreditLimit <= 0) {
        throw new Error('El cupo aprobado de la tarjeta de crédito debe ser mayor a 0');
      }
    } else {
      if (dto.originalPrincipal <= 0) {
        throw new Error('El capital del crédito debe ser mayor a 0');
      }
    }

    const principal = dto.originalPrincipal || 0;
    const approvedLimit = dto.approvedCreditLimit;
    const usedLimit = isCard ? principal : undefined;
    const availableLimit = isCard && approvedLimit !== undefined ? Math.max(0, approvedLimit - principal) : undefined;

    const list = this.creditProductsMap.get(userId) || [];
    const credit: CreditProduct = {
      id: (isCard ? 'card-' : 'credit-') + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId,
      institutionId: dto.institutionId,
      name: dto.name.trim(),
      type: dto.type,
      status: 'ACTIVE',
      originalPrincipal: principal,
      currentPrincipalBalance: principal,
      nominalRateMonthly: dto.nominalRateMonthly,
      effectiveAnnualRate: dto.effectiveAnnualRate,
      totalInstallments: dto.totalInstallments || 12,
      remainingInstallments: dto.remainingInstallments ?? dto.totalInstallments ?? 12,
      capitalizationPeriod: 'MONTHLY',
      amortizationMethod: dto.amortizationMethod || 'FRENCH',
      associatedInsurancesMonthly: dto.associatedInsurancesMonthly || 0,
      managementFeeMonthly: dto.managementFeeMonthly || 0,
      approvedCreditLimit: approvedLimit,
      usedCreditLimit: usedLimit,
      availableCreditLimit: availableLimit,
      statementCutoffDay: dto.statementCutoffDay,
      paymentDueDay: dto.paymentDueDay,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.creditProductsMap.set(userId, [...list, credit]);
    return credit;
  }

  async recordRestructure(userId: string, dto: RecordRestructureDTO): Promise<FinancialOperationResult> {
    const list = this.creditProductsMap.get(userId) || [];
    const credit = list.find((c) => c.id === dto.creditProductId);
    if (!credit) {
      throw new Error('Producto de crédito no encontrado o no pertenece al usuario');
    }

    const newMonthlyRate = FinancialCalculatorV2.roundRate(
      FinancialCalculatorV2.convertEaToMonthlyRate(dto.newEffectiveAnnualRate) * 100,
      4
    );
    credit.currentPrincipalBalance = dto.newPrincipalBalance;
    credit.effectiveAnnualRate = dto.newEffectiveAnnualRate;
    credit.nominalRateMonthly = newMonthlyRate;
    credit.totalInstallments = dto.newTotalInstallments;
    credit.remainingInstallments = dto.newTotalInstallments;
    credit.status = 'RESTRUCTURED';
    credit.updatedAt = new Date().toISOString();

    return {
      success: true,
      operationId: 'restruct-' + Date.now(),
      newBalance: dto.newPrincipalBalance,
      message: 'Reestructuración aplicada exitosamente',
    };
  }

  async getCreditCardPurchases(userId: string, creditCardId?: string): Promise<CreditCardPurchase[]> {
    this.ensureUserInitialized(userId);
    const list = this.creditCardPurchasesMap.get(userId) || [];
    if (creditCardId) {
      return list.filter((p) => p.productId === creditCardId);
    }
    return [...list];
  }

  async createCreditCardPurchase(userId: string, dto: CreateCreditCardPurchaseDTO): Promise<CreditCardPurchase> {
    this.ensureUserInitialized(userId);
    if (dto.amount <= 0) {
      throw new Error('El valor de la compra debe ser mayor a 0');
    }
    if (dto.totalInstallments < 1) {
      throw new Error('El número de cuotas debe ser como mínimo 1');
    }
    if (!dto.description || dto.description.trim() === '') {
      throw new Error('La descripción de la compra es obligatoria');
    }

    if (dto.idempotencyKey) {
      const cacheKey = `${userId}:${dto.idempotencyKey}`;
      const existing = this.purchaseIdempotencyStore.get(cacheKey);
      if (existing) {
        if (existing.payload.amount !== dto.amount || existing.payload.creditCardId !== dto.creditCardId || existing.payload.totalInstallments !== dto.totalInstallments) {
          throw new Error(`Conflicto de idempotencia: la clave ${dto.idempotencyKey} ya fue utilizada con parámetros diferentes (monto, tarjeta o cuotas no coinciden)`);
        }
        return existing.result;
      }
    }

    const credits = this.creditProductsMap.get(userId) || [];
    const card = credits.find((c) => c.id === dto.creditCardId);
    if (!card) {
      throw new Error('Tarjeta de crédito no encontrada');
    }
    if (card.type !== 'CREDIT_CARD') {
      throw new Error('El producto especificado no es una tarjeta de crédito');
    }

    // Regla de integridad: No permitir compras superiores al cupo disponible
    const available = card.availableCreditLimit ?? ((card.approvedCreditLimit || 0) - (card.usedCreditLimit || 0));
    if (dto.amount > available) {
      throw new Error(`Fondos insuficientes: el monto ${dto.amount} supera el cupo disponible de la tarjeta (${available})`);
    }

    const rate = dto.interestRateMonthly !== undefined ? dto.interestRateMonthly : card.nominalRateMonthly;
    const monthlyCap = FinancialCalculatorV2.roundMoney(dto.amount / dto.totalInstallments);
    const monthlyInt = rate > 0 ? FinancialCalculatorV2.roundMoney(dto.amount * (rate / 100)) : 0;

    const purchase: CreditCardPurchase = {
      id: 'pur-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      productId: card.id,
      userId,
      purchaseDate: dto.purchaseDate || new Date().toISOString().substring(0, 10),
      description: dto.description.trim(),
      originalAmount: dto.amount,
      totalInstallments: dto.totalInstallments,
      remainingInstallments: dto.totalInstallments,
      interestRateMonthly: rate,
      monthlyCapital: monthlyCap,
      monthlyInterest: monthlyInt,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    const purchasesList = this.creditCardPurchasesMap.get(userId) || [];
    this.creditCardPurchasesMap.set(userId, [...purchasesList, purchase]);

    card.usedCreditLimit = FinancialCalculatorV2.fromCents(
      FinancialCalculatorV2.toCents(card.usedCreditLimit || 0) + FinancialCalculatorV2.toCents(dto.amount)
    );
    card.availableCreditLimit = FinancialCalculatorV2.fromCents(
      FinancialCalculatorV2.toCents(card.approvedCreditLimit || 0) - FinancialCalculatorV2.toCents(card.usedCreditLimit)
    );
    card.currentPrincipalBalance = card.usedCreditLimit;
    card.updatedAt = new Date().toISOString();

    if (dto.idempotencyKey) {
      this.purchaseIdempotencyStore.set(`${userId}:${dto.idempotencyKey}`, {
        payload: { amount: dto.amount, creditCardId: dto.creditCardId, totalInstallments: dto.totalInstallments },
        result: purchase,
      });
    }

    return purchase;
  }

  async generateCreditInstallmentObligation(userId: string, dto: GenerateInstallmentDTO): Promise<PeriodObligation> {
    this.ensureUserInitialized(userId);
    const credits = this.creditProductsMap.get(userId) || [];
    const product = credits.find((c) => c.id === dto.creditProductId);
    if (!product) {
      throw new Error('Producto de crédito no encontrado');
    }

    // Regla de integridad: No generar dos veces la misma cuota del mismo período (idempotente)
    const existingObs = this.periodObligationsMap.get(userId) || [];
    const existing = existingObs.find(
      (o) => o.creditProductId === dto.creditProductId && o.periodYear === dto.periodYear && o.periodMonth === dto.periodMonth
    );
    if (existing) {
      return existing;
    }

    if (product.trackingStartDate) {
      const part = trackedInstallment(product, dto.periodYear, dto.periodMonth);
      const now = new Date().toISOString();
      const obligation: PeriodObligation = { id: crypto.randomUUID(), userId, creditProductId: product.id, sourceType: 'CREDIT_INSTALLMENT', periodYear: dto.periodYear, periodMonth: dto.periodMonth, name: `Cuota ${product.name}`, amount: part.amount, amountPaid: 0, amountPending: part.amount, status: 'PENDING', orderIndex: existingObs.length + 1, dueDate: part.dueDate, capitalComponent: part.capital, interestCurrentComponent: part.interest, interestMoraComponent: 0, insuranceComponent: part.insurance, otherFeesComponent: part.fees, createdAt: now, updatedAt: now };
      this.periodObligationsMap.set(userId, [...existingObs, obligation]);
      return obligation;
    }

    let obName = '';
    let totalAmount = 0;
    let capitalComp = 0;
    let interestComp = 0;
    let insuranceComp = 0;
    let feesComp = 0;

    if (product.type === 'CREDIT_CARD') {
      const allPurchases = this.creditCardPurchasesMap.get(userId) || [];
      const cardPurchases = allPurchases.filter((p) => p.productId === product.id && p.status === 'PENDING');
      const statement = FinancialCalculatorV2.calculateCreditCardStatement(cardPurchases, product.managementFeeMonthly || 0);

      obName = `Extracto Tarjeta ${product.name} (${dto.periodMonth}/${dto.periodYear})`;
      totalAmount = statement.totalStatementAmount;
      capitalComp = statement.totalCapitalPayment;
      interestComp = statement.totalInterestPayment;
      insuranceComp = product.associatedInsurancesMonthly || 0;
      feesComp = statement.managementFee;
      totalAmount = FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(totalAmount) + FinancialCalculatorV2.toCents(insuranceComp)
      );
    } else {
      // Crédito tradicional (Francés o Alemán)
      const remainingN = product.remainingInstallments || 12;
      const totalN = product.totalInstallments || 12;
      const installmentNum = totalN - remainingN + 1;

      let scheduleItem: any;
      if (product.amortizationMethod === 'GERMAN') {
        const schedule = FinancialCalculatorV2.generateGermanAmortizationSchedule(
          product.currentPrincipalBalance,
          product.nominalRateMonthly,
          remainingN,
          product.associatedInsurancesMonthly || 0
        );
        scheduleItem = schedule[0];
      } else {
        const schedule = FinancialCalculatorV2.generateFrenchAmortizationSchedule(
          product.currentPrincipalBalance,
          product.nominalRateMonthly,
          remainingN,
          product.associatedInsurancesMonthly || 0
        );
        scheduleItem = schedule[0];
      }

      if (!scheduleItem) {
        throw new Error('No se puede generar cuota: el crédito ya no tiene saldo pendiente');
      }

      obName = `Cuota ${installmentNum}/${totalN} ${product.name}`;
      totalAmount = scheduleItem.totalPayment;
      capitalComp = scheduleItem.principalPayment;
      interestComp = scheduleItem.interestPayment;
      insuranceComp = scheduleItem.insurancePayment;
      feesComp = product.managementFeeMonthly || 0;
    }

    const defaultDueDay = product.paymentDueDay || product.statementCutoffDay || 15;
    const formattedDueDay = defaultDueDay.toString().padStart(2, '0');
    const formattedMonth = dto.periodMonth.toString().padStart(2, '0');
    const computedDueDate = dto.dueDate || `${dto.periodYear}-${formattedMonth}-${formattedDueDay}`;

    const newObligation: PeriodObligation = {
      id: 'ob-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId,
      creditProductId: product.id,
      sourceType: 'CREDIT_INSTALLMENT',
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      name: obName,
      amount: totalAmount,
      amountPaid: 0,
      amountPending: totalAmount,
      status: 'PENDING',
      orderIndex: existingObs.length + 1,
      dueDate: computedDueDate,
      capitalComponent: capitalComp,
      interestCurrentComponent: interestComp,
      interestMoraComponent: 0,
      insuranceComponent: insuranceComp,
      otherFeesComponent: feesComp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.periodObligationsMap.set(userId, [...existingObs, newObligation]);
    return newObligation;
  }

  // --- REPOSITORIO DE OBLIGACIONES Y PAGOS ---

  async getPeriodObligations(userId: string, year: number, month: number): Promise<PeriodObligation[]> {
    this.ensureUserInitialized(userId);
    const list = this.periodObligationsMap.get(userId) || [];
    return list.filter((ob) => ob.periodYear === year && ob.periodMonth === month);
  }

  async getObligationById(userId: string, obligationId: string): Promise<PeriodObligation | null> {
    this.ensureUserInitialized(userId);
    const list = this.periodObligationsMap.get(userId) || [];
    return list.find((ob) => ob.id === obligationId) || null;
  }

  async createPeriodObligation(userId: string, dto: CreateObligationDTO): Promise<PeriodObligation> {
    if (dto.amount <= 0) {
      throw new Error('El monto de la obligación debe ser mayor a 0');
    }
    if (dto.creditProductId) {
      const credits = this.creditProductsMap.get(userId) || [];
      const belongs = credits.some((c) => c.id === dto.creditProductId);
      if (!belongs) {
        throw new Error('El producto de crédito asociado no existe o no pertenece al usuario');
      }
      const product = credits.find(c => c.id === dto.creditProductId)!;
      if (product.trackingStartDate) trackedInstallment(product, dto.periodYear, dto.periodMonth);
      if ((this.periodObligationsMap.get(userId) || []).some(o => o.creditProductId === dto.creditProductId && o.periodYear === dto.periodYear && o.periodMonth === dto.periodMonth)) throw new Error('La cuota del período ya existe.');
    }
    const list = this.periodObligationsMap.get(userId) || [];
    const ob: PeriodObligation = {
      id: 'ob-' + Date.now(),
      userId,
      creditProductId: dto.creditProductId,
      sourceType: dto.sourceType,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      name: dto.name.trim(),
      amount: dto.amount,
      amountPaid: 0,
      amountPending: dto.amount,
      status: 'PENDING',
      dueDate: dto.dueDate,
      orderIndex: list.length + 1,
      capitalComponent: dto.capitalComponent ?? dto.amount,
      interestCurrentComponent: dto.interestCurrentComponent || 0,
      insuranceComponent: dto.insuranceComponent || 0,
      otherFeesComponent: 0,
      interestMoraComponent: 0,
      notes: dto.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.periodObligationsMap.set(userId, [...list, ob]);
    return ob;
  }

  async recordPayment(userId: string, dto: RecordPaymentDTO): Promise<FinancialOperationResult> {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0 || Math.abs(dto.amount * 100 - Math.round(dto.amount * 100)) > .00001) {
      throw new Error('El monto del pago debe ser mayor a 0');
    }

    // 1. Verificación de Idempotencia
    if (dto.idempotencyKey) {
      const cacheKey = `${userId}:${dto.idempotencyKey}`;
      const existing = this.idempotencyStore.get(cacheKey);
      if (existing) {
        if (
          existing.payload.amount !== dto.amount ||
          existing.payload.obligationId !== dto.obligationId ||
          existing.payload.accountId !== dto.accountId ||
          existing.payload.paymentType !== (dto.paymentType || 'REGULAR_INSTALLMENT') ||
          existing.payload.paymentDate !== (dto.paymentDate || new Date().toISOString().slice(0,10)) ||
          JSON.stringify(existing.payload.allocation) !== JSON.stringify(dto.allocation)
        ) {
          throw new Error(`Conflicto de idempotencia: la clave ${dto.idempotencyKey} ya fue utilizada con parámetros diferentes`);
        }
        return { ...existing.result, isReplayed: true };
      }
    }

    const accounts = this.accountsMap.get(userId) || [];
    const account = accounts.find((a) => a.id === dto.accountId);
    if (!account) {
      throw new Error('Cuenta no encontrada o no pertenece al usuario');
    }

    if (account.currentBalance < dto.amount) {
      throw new Error(`Saldo insuficiente en la cuenta. Saldo actual: ${account.currentBalance}, Requerido: ${dto.amount}`);
    }

    const obligations = this.periodObligationsMap.get(userId) || [];
    const obligation = obligations.find((o) => o.id === dto.obligationId);
    if (!obligation) {
      throw new Error('Obligación no encontrada o no pertenece al usuario');
    }

    const isPrepayment = dto.paymentType === 'PREPAYMENT_CAPITAL';
    if (!isPrepayment) {
      if (obligation.status === 'PAID') {
        throw new Error('La obligación ya se encuentra totalmente cancelada');
      }
      if (dto.amount > obligation.amountPending) {
        throw new Error(`Intento de sobrepago: el monto ${dto.amount} excede el saldo pendiente exigible ${obligation.amountPending}`);
      }
    }

    const payments = this.paymentsMap.get(userId) || [];
    const active = payments.filter(p => p.obligationId === obligation.id && !p.isReversed && p.paymentType !== 'PREPAYMENT_CAPITAL');
    const cents = FinancialCalculatorV2.toCents;
    const money = FinancialCalculatorV2.fromCents;
    let appliedCap = 0;
    let appliedInt = 0;
    let appliedIns = 0;
    let appliedFees = 0;
    if (isPrepayment) {
      if (!obligation.creditProductId) throw new Error('El abono requiere una deuda asociada.');
      appliedCap = dto.amount;
    } else if (dto.allocation) {
      appliedCap = dto.allocation.appliedToCapital ?? 0;
      appliedInt = dto.allocation.appliedToInterest ?? 0;
      appliedIns = dto.allocation.appliedToInsurance ?? 0;
      appliedFees = dto.allocation.appliedToFees ?? 0;
    } else {
      const cascade = allocatePaymentCascade(obligation, payments, dto.amount);
      appliedFees = cascade.appliedToFees;
      appliedIns = cascade.appliedToInsurance;
      appliedInt = cascade.appliedToInterest;
      appliedCap = cascade.appliedToCapital;
    }
    if ([appliedCap, appliedInt, appliedIns, appliedFees].some(n => !Number.isFinite(n) || n < 0) || [appliedCap, appliedInt, appliedIns, appliedFees].reduce((sum,n) => sum+cents(n),0) !== cents(dto.amount)) throw new Error('El desglose debe sumar el importe del pago.');
    const debt = (this.creditProductsMap.get(userId) || []).find(c => c.id === obligation.creditProductId);
    if (debt && appliedCap > debt.currentPrincipalBalance) throw new Error('El capital supera el saldo de la deuda.');
    const date = dto.paymentDate || new Date().toISOString().slice(0,10);
    if (!validDate(date) || (debt?.trackingStartDate && date < debt.trackingStartDate)) throw new Error('Fecha de pago fuera del seguimiento.');
    if (account.isArchived) throw new Error('La cuenta esta archivada.');

    // 3. Débito a la cuenta (en centavos exactos)
    account.currentBalance = FinancialCalculatorV2.fromCents(
      FinancialCalculatorV2.toCents(account.currentBalance) - FinancialCalculatorV2.toCents(dto.amount)
    );
    account.updatedAt = new Date().toISOString();

    // 4. Actualización de cuota
    if (!isPrepayment) {
      obligation.amountPaid = FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(obligation.amountPaid) + FinancialCalculatorV2.toCents(dto.amount)
      );
      obligation.amountPending = FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(obligation.amountPending) - FinancialCalculatorV2.toCents(dto.amount)
      );
      obligation.status = obligation.amountPending === 0 ? 'PAID' : 'PARTIAL';
      obligation.updatedAt = new Date().toISOString();
    }

    // 5. Amortización a capital si aplica
    if (obligation.creditProductId) {
      const credits = this.creditProductsMap.get(userId) || [];
      const credit = credits.find((c) => c.id === obligation.creditProductId);
      if (credit) {
        credit.currentPrincipalBalance = Math.max(
          0,
          FinancialCalculatorV2.fromCents(
            FinancialCalculatorV2.toCents(credit.currentPrincipalBalance) - FinancialCalculatorV2.toCents(appliedCap)
          )
        );
        if (credit.type === 'CREDIT_CARD') {
          credit.usedCreditLimit = credit.currentPrincipalBalance;
          credit.availableCreditLimit = Math.max(
            0,
            FinancialCalculatorV2.fromCents(
              FinancialCalculatorV2.toCents(credit.approvedCreditLimit || 0) - FinancialCalculatorV2.toCents(credit.usedCreditLimit)
            )
          );
        } else if (!isPrepayment && obligation.status === 'PAID' && credit.remainingInstallments && credit.remainingInstallments > 0) {
          credit.remainingInstallments = Math.max(0, credit.remainingInstallments - 1);
        }
        credit.updatedAt = new Date().toISOString();
        if (credit.currentPrincipalBalance === 0) credit.status = 'PAID_OFF';
      }
    }

    const paymentId = crypto.randomUUID();
    this.paymentsMap.set(userId, [...payments, { id: paymentId, userId, obligationId: dto.obligationId, accountId: dto.accountId, amount: dto.amount, paymentType: dto.paymentType || 'REGULAR_INSTALLMENT', paymentDate: date, appliedToCapital: appliedCap, appliedToInterest: appliedInt, appliedToInsurance: appliedIns, appliedToFees: appliedFees, referenceNumber: dto.referenceNumber, idempotencyKey: dto.idempotencyKey, notes: dto.notes, isReversed: false, createdAt: new Date().toISOString() }]);
    const result: FinancialOperationResult = {
      success: true,
      operationId: paymentId,
      isReplayed: false,
      appliedToCapital: appliedCap,
      appliedToInterest: appliedInt,
      newBalance: account.currentBalance,
      message: 'Pago procesado exitosamente',
    };

    if (dto.idempotencyKey) {
      this.idempotencyStore.set(`${userId}:${dto.idempotencyKey}`, {
        result,
        payload: { amount: dto.amount, obligationId: dto.obligationId, accountId: dto.accountId, paymentType: dto.paymentType || 'REGULAR_INSTALLMENT', paymentDate: date, allocation: dto.allocation },
      });
    }

    return result;
  }

  // --- REPOSITORIO DE INGRESOS ---

  async getIncomes(userId: string, year: number, month: number): Promise<Income[]> {
    this.ensureUserInitialized(userId);
    const list = this.incomesMap.get(userId) || [];
    return list.filter((i) => i.periodYear === year && i.periodMonth === month && !i.isReversed);
  }

  async recordIncome(userId: string, dto: CreateIncomeDTO): Promise<FinancialOperationResult> {
    this.ensureUserInitialized(userId);
    if (dto.amount <= 0) {
      throw new Error('El monto del ingreso debe ser mayor a 0');
    }

    if (dto.idempotencyKey) {
      const cacheKey = `${userId}:${dto.idempotencyKey}`;
      const existing = this.idempotencyStore.get(cacheKey);
      if (existing) {
        if (existing.payload.amount !== dto.amount || existing.payload.sourceName !== dto.sourceName) {
          throw new Error(`Conflicto de idempotencia: la clave ${dto.idempotencyKey} ya fue utilizada con parámetros diferentes`);
        }
        return { ...existing.result, isReplayed: true };
      }
    }

    let targetAccount: FinancialAccount | undefined;
    if (dto.accountId) {
      const accounts = this.accountsMap.get(userId) || [];
      targetAccount = accounts.find((a) => a.id === dto.accountId);
      if (!targetAccount) {
        throw new Error('La cuenta seleccionada no existe o no pertenece al usuario');
      }
      if (targetAccount.isArchived) {
        throw new Error('La cuenta esta archivada.');
      }
      targetAccount.currentBalance = FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(targetAccount.currentBalance) + FinancialCalculatorV2.toCents(dto.amount)
      );
      targetAccount.updatedAt = new Date().toISOString();
    }

    const incomeId = 'inc-' + Date.now();
    const list = this.incomesMap.get(userId) || [];
    const inc: Income = {
      id: incomeId,
      userId,
      accountId: dto.accountId,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      sourceName: dto.sourceName.trim(),
      amount: dto.amount,
      receivedDate: dto.receivedDate || new Date().toISOString().substring(0, 10),
      isReversed: false,
      notes: dto.notes,
      createdAt: new Date().toISOString(),
    };
    this.incomesMap.set(userId, [...list, inc]);

    const result: FinancialOperationResult = {
      success: true,
      operationId: incomeId,
      newBalance: targetAccount?.currentBalance,
      message: 'Ingreso registrado exitosamente',
    };

    if (dto.idempotencyKey) {
      this.idempotencyStore.set(`${userId}:${dto.idempotencyKey}`, {
        result,
        payload: { amount: dto.amount, sourceName: dto.sourceName },
      });
    }

    return result;
  }

  // --- REPOSITORIO DE TRANSFERENCIAS Y REVERSOS ---

  async recordTransfer(userId: string, dto: RecordTransferDTO): Promise<FinancialOperationResult> {
    this.ensureUserInitialized(userId);
    if (dto.fromAccountId === dto.toAccountId) {
      throw new Error('La cuenta origen y destino deben ser distintas');
    }
    if (dto.amount <= 0) {
      throw new Error('El monto de la transferencia debe ser mayor a 0');
    }

    if (dto.idempotencyKey) {
      const cacheKey = `${userId}:${dto.idempotencyKey}`;
      const existing = this.idempotencyStore.get(cacheKey);
      if (existing) {
        if (
          existing.payload.amount !== dto.amount ||
          existing.payload.fromAccountId !== dto.fromAccountId ||
          existing.payload.toAccountId !== dto.toAccountId
        ) {
          throw new Error(`Conflicto de idempotencia: la clave ${dto.idempotencyKey} ya fue utilizada con parámetros diferentes`);
        }
        return { ...existing.result, isReplayed: true };
      }
    }

    const accounts = this.accountsMap.get(userId) || [];
    const fromAcc = accounts.find((a) => a.id === dto.fromAccountId);
    const toAcc = accounts.find((a) => a.id === dto.toAccountId);

    if (!fromAcc || !toAcc) {
      throw new Error('Una de las cuentas no existe o no pertenece al usuario');
    }
    if (fromAcc.isArchived || toAcc.isArchived) {
      throw new Error('La cuenta esta archivada.');
    }

    const totalDebit = FinancialCalculatorV2.fromCents(
      FinancialCalculatorV2.toCents(dto.amount) + FinancialCalculatorV2.toCents(dto.feeAmount || 0)
    );

    if (fromAcc.currentBalance < totalDebit) {
      throw new Error(`Saldo insuficiente en cuenta origen. Saldo actual: ${fromAcc.currentBalance}, Requerido: ${totalDebit}`);
    }

    fromAcc.currentBalance = FinancialCalculatorV2.fromCents(
      FinancialCalculatorV2.toCents(fromAcc.currentBalance) - FinancialCalculatorV2.toCents(totalDebit)
    );
    fromAcc.updatedAt = new Date().toISOString();

    toAcc.currentBalance = FinancialCalculatorV2.fromCents(
      FinancialCalculatorV2.toCents(toAcc.currentBalance) + FinancialCalculatorV2.toCents(dto.amount)
    );
    toAcc.updatedAt = new Date().toISOString();

    const transferId = crypto.randomUUID();
    this.transfersMap.set(userId, [...(this.transfersMap.get(userId) || []), { id: transferId, userId, fromAccountId: dto.fromAccountId, toAccountId: dto.toAccountId, amount: dto.amount, feeAmount: dto.feeAmount || 0, transferDate: new Date().toISOString().slice(0,10), isReversed: false, idempotencyKey: dto.idempotencyKey, notes: dto.notes, createdAt: new Date().toISOString() }]);
    const result: FinancialOperationResult = {
      success: true,
      operationId: transferId,
      newBalance: fromAcc.currentBalance,
      message: 'Transferencia ejecutada con éxito',
    };

    if (dto.idempotencyKey) {
      this.idempotencyStore.set(`${userId}:${dto.idempotencyKey}`, {
        result,
        payload: { amount: dto.amount, fromAccountId: dto.fromAccountId, toAccountId: dto.toAccountId },
      });
    }

    return result;
  }

  async reverseOperation(userId: string, dto: ReverseOperationDTO): Promise<FinancialOperationResult> {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new Error('Debe especificarse un motivo justificativo para el reverso financiero');
    }

    if (dto.operationType === 'PAYMENT') {
      const payment = (this.paymentsMap.get(userId) || []).find(p => p.id === dto.operationId);
      if (!payment || payment.isReversed) throw new Error('Pago no encontrado o ya revertido.');
      const obligation = (this.periodObligationsMap.get(userId) || []).find(o => o.id === payment.obligationId)!;
      const account = (this.accountsMap.get(userId) || []).find(a => a.id === payment.accountId)!;
      const money = (n: number) => FinancialCalculatorV2.fromCents(FinancialCalculatorV2.toCents(n));
      account.currentBalance = money(account.currentBalance + payment.amount);
      const wasPaid = obligation.status === 'PAID';
      if (payment.paymentType !== 'PREPAYMENT_CAPITAL') {
        obligation.amountPaid = money(obligation.amountPaid - payment.amount);
        obligation.amountPending = money(obligation.amountPending + payment.amount);
        obligation.status = obligation.amountPaid > 0 ? 'PARTIAL' : 'PENDING';
      }
      const product = (this.creditProductsMap.get(userId) || []).find(p => p.id === obligation.creditProductId);
      if (product) {
        product.currentPrincipalBalance = money(product.currentPrincipalBalance + payment.appliedToCapital);
        if (wasPaid && payment.paymentType !== 'PREPAYMENT_CAPITAL' && product.remainingInstallments !== undefined) product.remainingInstallments++;
        if (product.currentPrincipalBalance > 0 && product.status === 'PAID_OFF') product.status = 'ACTIVE';
      }
      payment.isReversed = true;
      payment.reversedAt = new Date().toISOString();
      payment.reversalReason = dto.reason;
    } else if (dto.operationType === 'TRANSFER') {
      const transfer = (this.transfersMap.get(userId) || []).find(t => t.id === dto.operationId);
      if (!transfer || transfer.isReversed) throw new Error('Transferencia no encontrada o ya revertida.');
      const accounts = this.accountsMap.get(userId) || [];
      const from = accounts.find(a => a.id === transfer.fromAccountId)!;
      const to = accounts.find(a => a.id === transfer.toAccountId)!;
      if (to.currentBalance < transfer.amount) throw new Error('Saldo insuficiente para revertir.');
      from.currentBalance = FinancialCalculatorV2.fromCents(FinancialCalculatorV2.toCents(from.currentBalance) + FinancialCalculatorV2.toCents(transfer.amount) + FinancialCalculatorV2.toCents(transfer.feeAmount));
      to.currentBalance = FinancialCalculatorV2.fromCents(FinancialCalculatorV2.toCents(to.currentBalance) - FinancialCalculatorV2.toCents(transfer.amount));
      transfer.isReversed = true;
      transfer.reversedAt = new Date().toISOString();
      transfer.reversalReason = dto.reason;
    } else if (dto.operationType === 'INCOME') {
      const incomes = this.incomesMap.get(userId) || [];
      const inc = incomes.find((i) => i.id === dto.operationId);
      if (!inc) {
        throw new Error('Ingreso no encontrado o no pertenece al usuario');
      }
      if (inc.isReversed) {
        throw new Error('El ingreso ya fue revertido previamente');
      }

      if (inc.accountId) {
        const accounts = this.accountsMap.get(userId) || [];
        const acc = accounts.find((a) => a.id === inc.accountId);
        if (acc) {
          acc.currentBalance = FinancialCalculatorV2.fromCents(
            FinancialCalculatorV2.toCents(acc.currentBalance) - FinancialCalculatorV2.toCents(inc.amount)
          );
        }
      }
      inc.isReversed = true;
      inc.reversedAt = new Date().toISOString();
      inc.reversalReason = dto.reason;
    }

    return {
      success: true,
      operationId: dto.operationId,
      message: 'Operación revertida exitosamente',
    };
  }
}
