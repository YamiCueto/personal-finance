import { MotionValueDirective } from '../../shared/motion/motion-value.directive';
import { AccountDeleteDialogComponent } from '../../shared/components/account-delete-dialog.component';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo.component';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, Routes } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { FinancialFacade } from '../../core/state/financial.facade';
import { provideFinancialCore } from '../../core/providers/financial-core.provider';
import { environment } from '../../../environments/environment';
import {
  AccountHistorySummary,
  FinancialAccount,
  FinancialAccountDeletionAudit,
  Income,
  PeriodObligation,
} from '../../core/models/financial-v2.model';
import { CreditsManagerComponent } from '../credits/credits-manager.component';
import { CreditCardsManagerComponent } from '../credit-cards/credit-cards-manager.component';
import { FinancialSimulatorsComponent } from '../simulators/financial-simulators.component';

import { IconComponent } from '../../shared/components/icon/icon.component';
import { ObligationStatusBadgeComponent } from '../../shared/components/obligation-status-badge/obligation-status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [
    AccountDeleteDialogComponent,
    MotionValueDirective,
    BrandLogoComponent,
    CommonModule,
    ReactiveFormsModule,
    CreditsManagerComponent,
    CreditCardsManagerComponent,
    FinancialSimulatorsComponent,
    IconComponent,
    ObligationStatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly financialFacade = inject(FinancialFacade);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private themeTimer: ReturnType<typeof setTimeout> | undefined;
  private sidebarFrame = 0;
  private sidebarAnimations: Animation[] = [];

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.themeTimer);
      document.documentElement.classList.remove('theme-motion');
      cancelAnimationFrame(this.sidebarFrame);
      this.sidebarAnimations.forEach(animation => animation.cancel());
    });
  }

  readonly user = this.authService.currentUser;

  // Inicializa con el año y mes actuales del dispositivo
  readonly selectedYear = signal<number>(new Date().getFullYear());
  readonly selectedMonth = signal<number>(new Date().getMonth() + 1);

  // Estados de carga, envío y feedback
  readonly isSubmitting = signal<boolean>(false);
  readonly actionError = signal<string | null>(null);
  readonly actionSuccess = signal<string | null>(null);

  // Control de interfaz responsive
  readonly isSidebarCollapsed = signal<boolean>(false);
  readonly showMobileMoreMenu = signal<boolean>(false);

  // Pestaña activa
  readonly activeTab = signal<
    'waterfall' | 'obligations' | 'credits' | 'cards' | 'simulators' | 'incomes' | 'accounts'
  >('waterfall');

  // Modales
  readonly showAccountModal = signal<boolean>(false);
  readonly showIncomeModal = signal<boolean>(false);
  readonly showObligationModal = signal<boolean>(false);
  readonly showPaymentModal = signal<boolean>(false);
  readonly selectedObligationForPayment = signal<PeriodObligation | null>(null);

  // Enlace reactivo directo a la fachada financiera
  readonly accounts = this.financialFacade.accounts;
  readonly activeAccounts = computed(() => this.accounts().filter(account => !account.isArchived));
  readonly archivedAccounts = computed(() => this.accounts().filter(account => account.isArchived));
  readonly accountViewFilter = signal<'all' | 'active' | 'archived'>('all');
  readonly accountToDelete = signal<FinancialAccount | null>(null);
  readonly accountToArchive = signal<FinancialAccount | null>(null);
  readonly deleteReason = signal('');
  readonly deleteBusy = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly deleteHasHistory = signal(false);
  readonly archiveBusy = signal(false);
  readonly archiveError = signal<string | null>(null);
  readonly restoreBusyId = signal<string | null>(null);
  readonly selectedAccountForHistory = signal<FinancialAccount | null>(null);
  readonly selectedAccountHistory = signal<AccountHistorySummary | null>(null);
  readonly accountDeletionAudit = signal<FinancialAccountDeletionAudit[]>([]);
  private archiveIdempotencyKey = '';
  private deleteOperationId = '';

  requestAccountDeletion(account: FinancialAccount): void {
    this.deleteError.set(null);
    this.deleteHasHistory.set(false);
    this.deleteReason.set('');
    this.deleteOperationId = crypto.randomUUID();
    this.accountToArchive.set(null);
    this.accountToDelete.set(account);
  }

  async confirmAccountDeletion(archive = false): Promise<void> {
    const account = this.accountToDelete();
    if (!account || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteError.set(null);
    try {
      if (archive) {
        await this.financialFacade.archiveAccount(account.id, crypto.randomUUID());
        this.accountToDelete.set(null);
        if (this.selectedAccountForHistory()?.id === account.id) {
          const updated = this.accounts().find(a => a.id === account.id) || null;
          this.selectedAccountForHistory.set(updated);
          this.selectedAccountHistory.set(await this.financialFacade.getAccountHistory(account.id));
        }
        this.actionSuccess.set('Cuenta archivada. Su historial se conserva.');
        return;
      }
      const reason = this.deleteReason().trim();
      if (reason) {
        await this.financialFacade.deleteAccount(account.id, { reason, operationId: this.deleteOperationId });
      } else {
        await this.financialFacade.deleteAccount(account.id);
      }
      this.accountToDelete.set(null);
      if (this.selectedAccountForHistory()?.id === account.id) {
        this.closeAccountHistory();
      }
      this.accountDeletionAudit.set(await this.financialFacade.getAccountDeletionAudit());
      this.actionSuccess.set('Cuenta eliminada correctamente.');
    } catch (error: any) {
      this.deleteError.set(error?.message || 'No se pudo eliminar la cuenta.');
      this.deleteHasHistory.set((error?.message || '').includes('historial financiero'));
    } finally {
      this.deleteBusy.set(false);
    }
  }

  requestAccountArchive(account: FinancialAccount): void {
    this.archiveError.set(null);
    this.archiveIdempotencyKey = crypto.randomUUID();
    this.accountToDelete.set(null);
    this.accountToArchive.set(account);
  }

  async confirmAccountArchive(): Promise<void> {
    const account = this.accountToArchive();
    if (!account || this.archiveBusy()) return;
    this.archiveBusy.set(true);
    this.archiveError.set(null);
    try {
      await this.financialFacade.archiveAccount(account.id, this.archiveIdempotencyKey);
      this.accountToArchive.set(null);
      if (this.selectedAccountForHistory()?.id === account.id) {
        const updated = this.accounts().find(a => a.id === account.id) || null;
        this.selectedAccountForHistory.set(updated);
        this.selectedAccountHistory.set(await this.financialFacade.getAccountHistory(account.id));
      }
      this.actionSuccess.set('Cuenta archivada. Su historial se conserva.');
    } catch (error: any) {
      this.archiveError.set(error?.message || 'No se pudo archivar la cuenta.');
    } finally {
      this.archiveBusy.set(false);
    }
  }

  async restoreArchivedAccount(account: FinancialAccount): Promise<void> {
    if (this.restoreBusyId()) return;
    this.restoreBusyId.set(account.id);
    this.clearFeedback();
    try {
      await this.financialFacade.restoreAccount(account.id, crypto.randomUUID());
      if (this.selectedAccountForHistory()?.id === account.id) {
        const updated = this.accounts().find(a => a.id === account.id) || null;
        this.selectedAccountForHistory.set(updated);
        this.selectedAccountHistory.set(await this.financialFacade.getAccountHistory(account.id));
      }
      this.actionSuccess.set(`Cuenta "${account.name}" restaurada y activa nuevamente.`);
    } catch (error: any) {
      this.actionError.set(error?.message || 'No se pudo restaurar la cuenta.');
    } finally {
      this.restoreBusyId.set(null);
    }
  }

  async openAccountHistory(account: FinancialAccount): Promise<void> {
    this.clearFeedback();
    try {
      const [history, deletions] = await Promise.all([
        this.financialFacade.getAccountHistory(account.id),
        this.financialFacade.getAccountDeletionAudit(),
      ]);
      this.selectedAccountForHistory.set(account);
      this.selectedAccountHistory.set(history);
      this.accountDeletionAudit.set(deletions);
    } catch (error: any) {
      this.actionError.set(error?.message || 'No se pudo cargar el historial de la cuenta.');
    }
  }

  closeAccountHistory(): void {
    this.selectedAccountForHistory.set(null);
    this.selectedAccountHistory.set(null);
  }
  readonly incomes = this.financialFacade.incomes;
  readonly obligations = this.financialFacade.periodObligations;
  readonly creditProducts = this.financialFacade.creditProducts;
  readonly loans = this.financialFacade.loans;
  readonly creditCards = this.financialFacade.creditCards;
  readonly waterfallItems = this.financialFacade.monthlyWaterfall;

  readonly totalLiquidBalance = this.financialFacade.totalLiquidBalance;
  readonly totalIncome = this.financialFacade.totalIncome;
  readonly totalMonthlyObligations = this.financialFacade.totalMonthlyObligations;
  readonly totalPaidObligations = this.financialFacade.totalPaidObligations;
  readonly totalPendingObligations = this.financialFacade.totalPendingObligations;
  readonly totalFreeProjected = this.financialFacade.totalFreeProjected;
  readonly projectedLiquidity = this.financialFacade.projectedLiquidity;
  readonly totalPrincipalDebt = this.financialFacade.totalPrincipalDebt;
  readonly totalAvailableCreditLimit = this.financialFacade.totalAvailableCreditLimit;
  readonly totalProjectedInterest = this.financialFacade.totalProjectedInterest;
  readonly upcomingDueDates = this.financialFacade.upcomingDueDates;
  readonly netWorth = this.financialFacade.netWorth;

  readonly pageTitles = {
    waterfall: 'Tu dinero, en perspectiva.',
    obligations: 'Cada compromiso, en orden.',
    credits: 'Un paso más cerca.',
    cards: 'Tus tarjetas, bajo control.',
    simulators: 'Explora tu próximo paso.',
    incomes: 'Lo que suma a tus planes.',
    accounts: 'Todo en su lugar.',
  };
  readonly pageDescriptions = {
    waterfall: 'Una vista clara de lo que tienes y lo que viene.',
    obligations: 'Organiza los pagos del mes y registra tu avance.',
    credits: 'Consulta tus créditos y sigue la evolución de tu deuda.',
    cards: 'Revisa tus cupos, saldos y compras en un solo espacio.',
    simulators: 'Compara escenarios antes de tomar una decisión.',
    incomes: 'Revisa tus ingresos y las cuentas donde los recibiste.',
    accounts: 'Tus saldos disponibles, cuenta por cuenta.',
  };
  readonly paidPercentage = computed(() => {
    const total = this.totalMonthlyObligations();
    return total > 0 ? Math.min(100, Math.max(0, this.totalPaidObligations() / total * 100)) : 0;
  });
  readonly pendingPayments = computed(() => this.obligations()
    .filter(o => o.status !== 'PAID' && o.status !== 'CANCELLED' && o.amountPending > 0)
    .slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 3));
  readonly theme = signal<'light' | 'dark'>(
    typeof document !== 'undefined' && document.documentElement.dataset['theme']
      ? document.documentElement.dataset['theme'] as 'light' | 'dark'
      : typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  toggleTheme(): void {
    document.documentElement.classList.add('theme-motion');
    clearTimeout(this.themeTimer);
    this.themeTimer = setTimeout(() => document.documentElement.classList.remove('theme-motion'), 300);
    this.theme.update(value => value === 'light' ? 'dark' : 'light');
    document.documentElement.dataset['theme'] = this.theme();
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta =>
      meta.setAttribute('content', this.theme() === 'light' ? '#f5f5ef' : '#14251f'),
    );
  }

  readonly monthsList = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  readonly accountForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    accountType: ['SAVINGS', [Validators.required]],
    initialBalance: [0, [Validators.required, Validators.min(0)]],
  });

  readonly incomeForm: FormGroup = this.fb.group({
    accountId: ['', [Validators.required]],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    description: ['', [Validators.required, Validators.minLength(3)]],
    receivedDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
  });

  readonly obligationForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    sourceType: ['RECURRENT_EXPENSE', [Validators.required]],
    dueDate: [''],
    creditProductId: [''],
    capitalComponent: [null],
    interestComponent: [null],
    insuranceComponent: [null],
  });

  readonly paymentForm: FormGroup = this.fb.group({
    accountId: ['', [Validators.required]],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    paymentDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
    paymentMode: ['TOTAL', [Validators.required]],
    notes: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.financialFacade.loadPeriodData({
      year: this.selectedYear(),
      month: this.selectedMonth(),
    });
  }

  async selectMonth(month: number): Promise<void> {
    this.selectedMonth.set(month);
    this.clearFeedback();
    await this.financialFacade.setPeriod(this.selectedYear(), month);
  }

  setActiveTab(
    tab: 'waterfall' | 'obligations' | 'credits' | 'cards' | 'simulators' | 'incomes' | 'accounts'
  ): void {
    this.activeTab.set(tab);
    this.showMobileMoreMenu.set(false);
    this.clearFeedback();
  }

  toggleSidebar(): void {
    const main = this.element.nativeElement.querySelector<HTMLElement>('.app-main-wrapper');
    const before = main?.getBoundingClientRect().left ?? 0;
    this.sidebarAnimations.forEach(animation => animation.cancel());
    cancelAnimationFrame(this.sidebarFrame);
    this.isSidebarCollapsed.update((v) => !v);
    if (!main || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.sidebarFrame = requestAnimationFrame(() => {
      const duration = parseFloat(getComputedStyle(main).getPropertyValue('--motion-state')) || 220;
      this.sidebarAnimations = [main.animate([
        { transform: `translateX(${before - main.getBoundingClientRect().left}px)` },
        { transform: 'translateX(0)' },
      ], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' })];
      const nav = this.element.nativeElement.querySelector<HTMLElement>('.sidebar-nav');
      if (nav) this.sidebarAnimations.push(nav.animate([{ opacity: .65 }, { opacity: 1 }], { duration }));
    });
  }

  toggleMobileMore(): void {
    this.showMobileMoreMenu.update((v) => !v);
  }

  closeMobileMore(): void {
    this.showMobileMoreMenu.set(false);
  }

  clearFeedback(): void {
    this.actionError.set(null);
    this.actionSuccess.set(null);
  }

  // --- GESTIÓN DE CUENTAS ---

  openAccountModal(): void {
    this.clearFeedback();
    this.accountForm.reset({ accountType: 'SAVINGS', initialBalance: 0 });
    this.showAccountModal.set(true);
  }

  closeAccountModal(): void {
    this.showAccountModal.set(false);
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid || this.isSubmitting()) {
      this.accountForm.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.clearFeedback();

    try {
      const val = this.accountForm.getRawValue();
      await this.financialFacade.createAccount({
        name: val.name.trim(),
        type: val.accountType,
        initialBalance: Number(val.initialBalance),
      });
      this.actionSuccess.set(`Cuenta "${val.name.trim()}" creada con éxito.`);
      this.closeAccountModal();
    } catch (err: any) {
      this.actionError.set(err?.message || 'Error al crear la cuenta bancaria.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- GESTIÓN DE INGRESOS ---

  openIncomeModal(): void {
    this.clearFeedback();
    const accList = this.activeAccounts();
    const accId = accList.length > 0 ? accList[0].id : '';
    this.incomeForm.reset({
      accountId: accId,
      amount: null,
      description: '',
      receivedDate: new Date().toISOString().substring(0, 10),
    });
    this.showIncomeModal.set(true);
  }

  closeIncomeModal(): void {
    this.showIncomeModal.set(false);
  }

  async saveIncome(): Promise<void> {
    if (this.incomeForm.invalid || this.isSubmitting()) {
      this.incomeForm.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.clearFeedback();

    try {
      const val = this.incomeForm.getRawValue();
      const amountNum = Number(val.amount);
      await this.financialFacade.recordIncome({
        accountId: val.accountId,
        sourceName: val.description.trim(),
        amount: amountNum,
        periodYear: this.selectedYear(),
        periodMonth: this.selectedMonth(),
        receivedDate: val.receivedDate,
      });
      this.actionSuccess.set(`Ingreso de $${amountNum.toLocaleString('es-CO')} registrado exitosamente.`);
      this.closeIncomeModal();
    } catch (err: any) {
      this.actionError.set(err?.message || 'Error al registrar el ingreso.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- GESTIÓN DE OBLIGACIONES ---

  openObligationModal(): void {
    this.clearFeedback();
    this.obligationForm.reset({
      name: '',
      amount: null,
      sourceType: 'RECURRENT_EXPENSE',
      dueDate: '',
      creditProductId: '',
      capitalComponent: null,
      interestComponent: null,
      insuranceComponent: null,
    });
    this.showObligationModal.set(true);
  }

  closeObligationModal(): void {
    this.showObligationModal.set(false);
  }

  async saveObligation(): Promise<void> {
    if (this.obligationForm.invalid || this.isSubmitting()) {
      this.obligationForm.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.clearFeedback();

    try {
      const val = this.obligationForm.getRawValue();
      const amountNum = Number(val.amount);
      const capComp = val.capitalComponent ? Number(val.capitalComponent) : amountNum;
      const intComp = val.interestComponent ? Number(val.interestComponent) : 0;
      const insComp = val.insuranceComponent ? Number(val.insuranceComponent) : 0;

      await this.financialFacade.createPeriodObligation({
        name: val.name.trim(),
        amount: amountNum,
        sourceType: val.sourceType,
        periodYear: this.selectedYear(),
        periodMonth: this.selectedMonth(),
        dueDate: val.dueDate || undefined,
        creditProductId: val.creditProductId || undefined,
        capitalComponent: capComp,
        interestCurrentComponent: intComp,
        insuranceComponent: insComp,
      });

      this.actionSuccess.set(`Obligación "${val.name.trim()}" creada por $${amountNum.toLocaleString('es-CO')}.`);
      this.closeObligationModal();
    } catch (err: any) {
      this.actionError.set(err?.message || 'Error al crear la obligación financiera.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- GESTIÓN DE PAGOS ---

  openPaymentModal(ob: PeriodObligation): void {
    this.clearFeedback();
    this.selectedObligationForPayment.set(ob);
    const accList = this.accounts().filter((a) => !a.isArchived);
    const accId = accList.length > 0 ? accList[0].id : '';
    this.paymentForm.reset({
      accountId: accId,
      amount: ob.amountPending,
      paymentDate: new Date().toISOString().substring(0, 10),
      paymentMode: 'TOTAL',
      notes: '',
    });
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void {
    this.showPaymentModal.set(false);
    this.selectedObligationForPayment.set(null);
  }

  onPaymentModeChange(mode: 'TOTAL' | 'PARTIAL'): void {
    const ob = this.selectedObligationForPayment();
    if (!ob) return;
    if (mode === 'TOTAL') {
      this.paymentForm.patchValue({ amount: ob.amountPending });
    }
  }

  async submitPayment(): Promise<void> {
    if (this.paymentForm.invalid || this.isSubmitting()) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const ob = this.selectedObligationForPayment();
    if (!ob) return;

    const val = this.paymentForm.getRawValue();
    const paymentAmount = Number(val.amount);

    if (paymentAmount <= 0) {
      this.actionError.set('El monto a pagar debe ser mayor a cero.');
      return;
    }
    if (paymentAmount > ob.amountPending) {
      this.actionError.set(`El monto ($${paymentAmount.toLocaleString('es-CO')}) excede el saldo pendiente ($${ob.amountPending.toLocaleString('es-CO')}).`);
      return;
    }

    const account = this.accounts().find((a) => a.id === val.accountId);
    if (!account) {
      this.actionError.set('Debes seleccionar una cuenta válida.');
      return;
    }
    if (account.currentBalance < paymentAmount) {
      this.actionError.set(`Fondos insuficientes en ${account.name}. Saldo disponible: $${account.currentBalance.toLocaleString('es-CO')}.`);
      return;
    }

    this.isSubmitting.set(true);
    this.clearFeedback();

    try {
      const res = await this.financialFacade.recordPayment({
        obligationId: ob.id,
        accountId: val.accountId,
        amount: paymentAmount,
        paymentDate: val.paymentDate,
        notes: val.notes?.trim() || undefined,
      });

      this.actionSuccess.set(res.message || `Pago de $${paymentAmount.toLocaleString('es-CO')} registrado exitosamente.`);
      this.closePaymentModal();
    } catch (err: any) {
      this.actionError.set(err?.message || 'Error al procesar el pago.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- REINICIAR DEMO ---

  async resetDemoScenario(): Promise<void> {
    if (!this.financialFacade.isDemoMode()) {
      return;
    }
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.clearFeedback();

    try {
      await this.financialFacade.resetLocalScenario();
      this.actionSuccess.set('Escenario local reiniciado con éxito con datos ficticios.');
    } catch (err: any) {
      this.actionError.set(err?.message || 'Error al reiniciar el escenario demo.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onSignOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/auth/login']);
  }
}

export const APP_SHELL_ROUTES: Routes = [
  {
    path: '',
    providers: [
      provideFinancialCore(environment.providerMode ? { providerMode: environment.providerMode } : {}),
    ],
    component: AppShellComponent,
  },
];
