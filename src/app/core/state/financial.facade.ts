import { Injectable, computed, inject, signal } from '@angular/core';
import {
  FinancialAccount,
  CreditProduct,
  PeriodObligation,
  Income,
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
  CreateIncomeDTO,
  CreateObligationDTO,
  FinancialOperationResult,
  RecordPaymentDTO,
  RecordTransferDTO,
} from '../repositories/financial-repositories.contract';

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
  public readonly config = inject(FINANCIAL_CONFIG);

  // --- SEÑALES DE ESTADO BASE ---
  readonly selectedPeriod = signal<SelectedPeriod>({ year: 2026, month: 5 });
  readonly accounts = signal<FinancialAccount[]>([]);
  readonly creditProducts = signal<CreditProduct[]>([]);
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
      const [accs, credits, obs, incs] = await Promise.all([
        this.accountsService.getAccounts(),
        this.creditsService.getCreditProducts(),
        this.obligationsService.getPeriodObligations(year, month),
        this.incomesService.getIncomes(year, month),
      ]);

      this.accounts.set(accs);
      this.creditProducts.set(credits);
      this.periodObligations.set(obs);
      this.incomes.set(incs);
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
}
