import { Injectable, computed, inject, signal } from '@angular/core';
import {
  FinancialAccount,
  CreditProduct,
  PeriodObligation,
  Income,
  CreditCardPurchase,
  AmortizationScheduleItem,
  PrepaymentSimulationResult,
  RedeferredSimulationResult,
} from '../models/financial-v2.model';
import { FinancialAccountsService } from '../services/financial-accounts.service';
import { CreditProductsService } from '../services/credit-products.service';
import { PeriodObligationsService } from '../services/period-obligations.service';
import { IncomesService } from '../services/incomes.service';
import { FinancialOperationsService } from '../services/financial-operations.service';
import { FINANCIAL_CONFIG } from '../config/financial.config';
import { FinancialCalculatorV2 } from '../services/financial-calculator-v2';
import {
  CreateAccountDTO,
  CreateCreditProductDTO,
  CreateCreditCardPurchaseDTO,
  GenerateInstallmentDTO,
  CreateIncomeDTO,
  CreateObligationDTO,
  FinancialOperationResult,
  RecordPaymentDTO,
  RecordTransferDTO,
} from '../repositories/financial-repositories.contract';

import { AuthService } from '../services/auth.service';
import { LocalFinancialAdapter } from '../repositories/local-financial.adapter';

export interface SelectedPeriod {
  year: number;
  month: number;
}

@Injectable({
  providedIn: 'root',
})
export class FinancialFacade {
  private readonly accountsService = inject(FinancialAccountsService);
  private readonly creditsService = inject(CreditProductsService);
  private readonly obligationsService = inject(PeriodObligationsService);
  private readonly incomesService = inject(IncomesService);
  private readonly operationsService = inject(FinancialOperationsService);
  private readonly auth = inject(AuthService);
  private readonly localAdapter = inject(LocalFinancialAdapter, { optional: true });
  public readonly config = inject(FINANCIAL_CONFIG);

  // --- SEÑALES DE ESTADO BASE ---
  // Inicia dinámicamente con el mes y año actuales según la zona horaria del dispositivo
  readonly selectedPeriod = signal<SelectedPeriod>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });
  readonly accounts = signal<FinancialAccount[]>([]);
  readonly creditProducts = signal<CreditProduct[]>([]);
  readonly creditCardPurchases = signal<CreditCardPurchase[]>([]);
  readonly periodObligations = signal<PeriodObligation[]>([]);
  readonly incomes = signal<Income[]>([]);

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isDemoMode = computed(() => this.config.providerMode === 'local-demo');

  // --- MÉTRICAS REACTIVAS DERIVADAS (COMPUTED SIGNALS) ---

  /**
   * Saldo Total Líquido en Cuentas (Activos Reales Confirmados).
   * Solo incluye cuentas no archivadas.
   */
  readonly totalLiquidBalance = computed<number>(() => {
    return this.accounts()
      .filter((a) => !a.isArchived)
      .reduce((sum, a) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(a.currentBalance)
        );
      }, 0);
  });

  /**
   * Total de Ingresos del Período Seleccionado.
   */
  readonly totalIncome = computed<number>(() => {
    return this.incomes().reduce((sum, i) => {
      return FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(i.amount)
      );
    }, 0);
  });

  /**
   * Total de Compromisos / Obligaciones Exigibles del Mes.
   */
  readonly totalMonthlyObligations = computed<number>(() => {
    return this.periodObligations().reduce((sum, o) => {
      return FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(o.amount)
      );
    }, 0);
  });

  /**
   * Obligaciones Pendientes de Pago en el Período.
   */
  readonly totalPendingObligations = computed<number>(() => {
    return this.periodObligations()
      .filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED')
      .reduce((sum, o) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(o.amountPending)
        );
      }, 0);
  });

  /**
   * Obligaciones Ya Pagadas en el Período.
   */
  readonly totalPaidObligations = computed<number>(() => {
    return this.periodObligations().reduce((sum, o) => {
      return FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(o.amountPaid)
      );
    }, 0);
  });

  /**
   * Dinero Libre Proyectado del Mes:
   * (Total Ingresos del Mes - Total Obligaciones Exigibles del Mes).
   */
  readonly totalFreeProjected = computed<number>(() => {
    const inc = FinancialCalculatorV2.toCents(this.totalIncome());
    const ob = FinancialCalculatorV2.toCents(this.totalMonthlyObligations());
    return FinancialCalculatorV2.fromCents(inc - ob);
  });

  /**
   * Liquidez Proyectada del Usuario:
   * Saldo líquido real actual en cuentas - Total de obligaciones pendientes del período.
   * Representa los fondos que quedarán efectivamente en las cuentas tras cubrir todos los compromisos restantes.
   */
  readonly projectedLiquidity = computed<number>(() => {
    const liquid = FinancialCalculatorV2.toCents(this.totalLiquidBalance());
    const pending = FinancialCalculatorV2.toCents(this.totalPendingObligations());
    return FinancialCalculatorV2.fromCents(liquid - pending);
  });

  /**
   * Deuda Total de Capital en Productos Crediticios Activos (Pasivo Consolidado).
   */
  readonly totalPrincipalDebt = computed<number>(() => {
    return this.creditProducts()
      .filter((c) => c.status === 'ACTIVE' || c.status === 'RESTRUCTURED')
      .reduce((sum, c) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(c.currentPrincipalBalance)
        );
      }, 0);
  });

  /**
   * Patrimonio Neto Estimado:
   * Activos Líquidos en Cuentas - Deuda Total de Capital.
   */
  readonly netWorth = computed<number>(() => {
    const assets = FinancialCalculatorV2.toCents(this.totalLiquidBalance());
    const liabilities = FinancialCalculatorV2.toCents(this.totalPrincipalDebt());
    return FinancialCalculatorV2.fromCents(assets - liabilities);
  });

  /**
   * Cascada Mensual de Prelación (Waterfall).
   * Muestra visualmente la absorción progresiva de los ingresos sobre cada compromiso.
   */
  readonly monthlyWaterfall = computed<Array<PeriodObligation & { remainingResto: number }>>(() => {
    const totalInc = this.totalIncome();
    const sortedObs = [...this.periodObligations()].sort((a, b) => a.orderIndex - b.orderIndex);
    return FinancialCalculatorV2.calculateCascadeWaterfall(totalInc, sortedObs);
  });

  /**
   * Créditos Tradicionales (Préstamos vehiculares, hipotecarios, consumo, libranza).
   */
  readonly loans = computed<CreditProduct[]>(() => {
    return this.creditProducts().filter((c) => c.type !== 'CREDIT_CARD');
  });

  /**
   * Tarjetas de Crédito Activas.
   */
  readonly creditCards = computed<CreditProduct[]>(() => {
    return this.creditProducts().filter((c) => c.type === 'CREDIT_CARD');
  });

  readonly activeLoansCount = computed<number>(() => {
    return this.loans().filter((c) => c.status === 'ACTIVE' || c.status === 'RESTRUCTURED').length;
  });

  readonly activeCreditCardsCount = computed<number>(() => {
    return this.creditCards().filter((c) => c.status === 'ACTIVE').length;
  });

  readonly totalApprovedCreditLimit = computed<number>(() => {
    return this.creditCards()
      .filter((c) => c.status === 'ACTIVE')
      .reduce((sum, c) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(c.approvedCreditLimit || 0)
        );
      }, 0);
  });

  readonly totalUsedCreditLimit = computed<number>(() => {
    return this.creditCards()
      .filter((c) => c.status === 'ACTIVE')
      .reduce((sum, c) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(c.usedCreditLimit || c.currentPrincipalBalance || 0)
        );
      }, 0);
  });

  readonly totalAvailableCreditLimit = computed<number>(() => {
    return this.creditCards()
      .filter((c) => c.status === 'ACTIVE')
      .reduce((sum, c) => {
        const approved = c.approvedCreditLimit || 0;
        const used = c.usedCreditLimit ?? c.currentPrincipalBalance ?? 0;
        const avail = c.availableCreditLimit ?? Math.max(0, approved - used);
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(avail)
        );
      }, 0);
  });

  readonly loansPrincipalDebt = computed<number>(() => {
    return this.loans()
      .filter((c) => c.status === 'ACTIVE' || c.status === 'RESTRUCTURED')
      .reduce((sum, c) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(c.currentPrincipalBalance)
        );
      }, 0);
  });

  readonly cardsPrincipalDebt = computed<number>(() => {
    return this.creditCards()
      .filter((c) => c.status === 'ACTIVE')
      .reduce((sum, c) => {
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(c.currentPrincipalBalance)
        );
      }, 0);
  });

  readonly totalProjectedInterest = computed<number>(() => {
    return this.loans()
      .filter((c) => c.status === 'ACTIVE' || c.status === 'RESTRUCTURED')
      .reduce((sum, loan) => {
        if (loan.nominalRateMonthly <= 0 || loan.currentPrincipalBalance <= 0) return sum;
        const remaining = loan.remainingInstallments || loan.totalInstallments || 12;
        const schedule = loan.amortizationMethod === 'GERMAN'
          ? FinancialCalculatorV2.generateGermanAmortizationSchedule(loan.currentPrincipalBalance, loan.nominalRateMonthly, remaining, 0)
          : FinancialCalculatorV2.generateFrenchAmortizationSchedule(loan.currentPrincipalBalance, loan.nominalRateMonthly, remaining, 0);
        const interestSum = schedule.reduce((acc, item) => acc + item.interestPayment, 0);
        return FinancialCalculatorV2.fromCents(
          FinancialCalculatorV2.toCents(sum) + FinancialCalculatorV2.toCents(interestSum)
        );
      }, 0);
  });

  readonly upcomingDueDates = computed<PeriodObligation[]>(() => {
    return this.periodObligations()
      .filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED' && !!o.dueDate)
      .sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1));
  });

  /**
   * Carga todo el conjunto de datos financieros para el período seleccionado.
   */
  async loadPeriodData(period?: SelectedPeriod): Promise<void> {
    if (period) {
      this.selectedPeriod.set(period);
    }
    const { year, month } = this.selectedPeriod();

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const [accs, credits, obs, incs, purchases] = await Promise.all([
        this.accountsService.getAccounts(),
        this.creditsService.getCreditProducts(),
        this.obligationsService.getPeriodObligations(year, month),
        this.incomesService.getIncomes(year, month),
        this.creditsService.getCreditCardPurchases(),
      ]);

      this.accounts.set(accs);
      this.creditProducts.set(credits);
      this.periodObligations.set(obs);
      this.incomes.set(incs);
      this.creditCardPurchases.set(purchases);
    } catch (err: any) {
      const msg = err?.message || 'Error al cargar los datos financieros';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  setPeriod(year: number, month: number): void {
    this.selectedPeriod.set({ year, month });
    this.loadPeriodData();
  }

  // --- MUTACIONES ORQUESTADAS ---

  async createAccount(dto: CreateAccountDTO): Promise<FinancialAccount> {
    const acc = await this.accountsService.createAccount(dto);
    this.accounts.update((list) => [...list, acc]);
    return acc;
  }

  async archiveAccount(accountId: string): Promise<void> {
    await this.accountsService.archiveAccount(accountId);
    this.accounts.update((list) =>
      list.map((a) => (a.id === accountId ? { ...a, isArchived: true } : a))
    );
  }

  async recordIncome(dto: CreateIncomeDTO): Promise<FinancialOperationResult> {
    const res = await this.incomesService.recordIncome(dto);
    await this.loadPeriodData();
    return res;
  }

  async createPeriodObligation(dto: CreateObligationDTO): Promise<PeriodObligation> {
    const ob = await this.obligationsService.createPeriodObligation(dto);
    this.periodObligations.update((list) => [...list, ob]);
    return ob;
  }

  async recordPayment(dto: RecordPaymentDTO): Promise<FinancialOperationResult> {
    const res = await this.obligationsService.recordPayment(dto);
    await this.loadPeriodData();
    return res;
  }

  async recordTransfer(dto: RecordTransferDTO): Promise<FinancialOperationResult> {
    const res = await this.operationsService.recordTransfer(dto);
    await this.loadPeriodData();
    return res;
  }

  async createCreditProduct(dto: CreateCreditProductDTO): Promise<CreditProduct> {
    const cred = await this.creditsService.createCreditProduct(dto);
    await this.loadPeriodData();
    return cred;
  }

  async createCreditCardPurchase(dto: CreateCreditCardPurchaseDTO): Promise<CreditCardPurchase> {
    const pur = await this.creditsService.createCreditCardPurchase(dto);
    await this.loadPeriodData();
    return pur;
  }

  async generateCreditInstallment(dto: GenerateInstallmentDTO): Promise<PeriodObligation> {
    const ob = await this.creditsService.generateCreditInstallmentObligation(dto);
    await this.loadPeriodData();
    return ob;
  }

  getAmortizationSchedule(credit: CreditProduct): AmortizationScheduleItem[] {
    const method = credit.amortizationMethod || 'FRENCH';
    const ins = credit.associatedInsurancesMonthly || 0;
    const installments = credit.remainingInstallments || credit.totalInstallments || 12;
    if (method === 'GERMAN') {
      return FinancialCalculatorV2.generateGermanAmortizationSchedule(
        credit.currentPrincipalBalance,
        credit.nominalRateMonthly,
        installments,
        ins
      );
    }
    return FinancialCalculatorV2.generateFrenchAmortizationSchedule(
      credit.currentPrincipalBalance,
      credit.nominalRateMonthly,
      installments,
      ins
    );
  }

  simulatePrepayment(
    currentPrincipal: number,
    effectiveAnnualRate: number,
    remainingInstallments: number,
    prepaymentAmount: number,
    strategy: 'REDUCE_TERM' | 'REDUCE_INSTALLMENT',
    associatedInsurance = 0
  ): PrepaymentSimulationResult {
    return FinancialCalculatorV2.simulatePrepayment(
      currentPrincipal,
      effectiveAnnualRate,
      remainingInstallments,
      prepaymentAmount,
      strategy,
      associatedInsurance
    );
  }

  simulateRedeferred(
    currentPrincipal: number,
    currentEa: number,
    currentRemainingInstallments: number,
    proposedEa: number,
    proposedInstallments: number
  ): RedeferredSimulationResult {
    return FinancialCalculatorV2.simulateRedeferred(
      currentPrincipal,
      currentEa,
      currentRemainingInstallments,
      proposedEa,
      proposedInstallments
    );
  }

  /**
   * Reinicia el escenario demostrativo para el usuario activo y recarga los datos.
   */
  async resetLocalScenario(): Promise<void> {
    const userId = this.auth.currentUser()?.id || 'default-user';
    if (this.localAdapter) {
      this.localAdapter.resetUserScenario(userId);
    }
    await this.loadPeriodData();
  }
}
