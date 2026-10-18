import { Injectable } from '@angular/core';
import {
  FinancialAccount,
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

  // Caché de idempotencia en memoria: user_id:key -> FinancialOperationResult
  private idempotencyStore = new Map<string, { result: FinancialOperationResult; payload: any }>();

  // Caché de idempotencia para compras de tarjeta (tipo distinto a FinancialOperationResult)
  private purchaseIdempotencyStore = new Map<string, { result: CreditCardPurchase; payload: { amount: number; creditCardId: string } }>();

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

  async archiveAccount(userId: string, accountId: string): Promise<void> {
    const list = this.accountsMap.get(userId) || [];
    const target = list.find((a) => a.id === accountId);
    if (!target) {
      throw new Error('Cuenta no encontrada o no pertenece al usuario');
    }
    target.isArchived = true;
    target.updatedAt = new Date().toISOString();
  }

  // --- REPOSITORIO DE CRÉDITOS ---

  async getCreditProducts(userId: string): Promise<CreditProduct[]> {
    this.ensureUserInitialized(userId);
    return [...(this.creditProductsMap.get(userId) || [])];
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
        if (existing.payload.amount !== dto.amount || existing.payload.creditCardId !== dto.creditCardId) {
          throw new Error(`Conflicto de idempotencia: la clave ${dto.idempotencyKey} ya fue utilizada con parámetros diferentes`);
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
        payload: { amount: dto.amount, creditCardId: dto.creditCardId },
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
      capitalComponent: dto.capitalComponent || dto.amount,
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
    if (dto.amount <= 0) {
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
          existing.payload.accountId !== dto.accountId
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

    // 2. Desglose contable usando la cascada del motor financiero
    let appliedCap = 0;
    let appliedInt = 0;

    if (isPrepayment) {
      appliedCap = dto.amount;
    } else if (dto.allocation) {
      appliedCap = dto.allocation.appliedToCapital || 0;
      appliedInt = dto.allocation.appliedToInterest || 0;
    } else {
      // Cascada estándar: Seguro -> Interés -> Capital
      let rem = dto.amount;
      const insTake = Math.min(rem, obligation.insuranceComponent);
      rem -= insTake;
      const intTake = Math.min(rem, obligation.interestCurrentComponent);
      rem -= intTake;
      appliedInt = intTake;
      appliedCap = rem;
    }

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
    if (obligation.creditProductId && appliedCap > 0) {
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
        } else if (obligation.status === 'PAID' && credit.remainingInstallments && credit.remainingInstallments > 0) {
          credit.remainingInstallments = Math.max(0, credit.remainingInstallments - 1);
        }
        credit.updatedAt = new Date().toISOString();
      }
    }

    const paymentId = 'pay-' + Date.now();
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
        payload: { amount: dto.amount, obligationId: dto.obligationId, accountId: dto.accountId },
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

    const transferId = 'tr-' + Date.now();
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

    if (dto.operationType === 'INCOME') {
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
