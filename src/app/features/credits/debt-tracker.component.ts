import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FinancialFacade } from '../../core/state/financial.facade';
import { FinancialAccountsService } from '../../core/services/financial-accounts.service';
import { CreditProduct, FinancialInstitution, ObligationPayment, PeriodObligation } from '../../core/models/financial-v2.model';
import { DebtHistory } from '../../core/models/debt-tracking.model';
import { allocatePaymentCascade, debtOverallTotals, debtYearSummary } from '../../core/services/debt-history';
import { FinancialCalculatorV2 as Money } from '../../core/services/financial-calculator-v2';

@Component({
  selector: 'app-debt-tracker',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './debt-tracker.component.html',
  styleUrl: './debt-tracker.component.scss',
})
export class DebtTrackerComponent {
  readonly facade = inject(FinancialFacade);
  private readonly accountsService = inject(FinancialAccountsService);
  private readonly fb = inject(FormBuilder);
  readonly creating = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly institutions = signal<FinancialInstitution[]>([]);
  readonly institutionForm = this.fb.group({ name: ['', Validators.required] });
  readonly selectedId = signal<string | null>(null);
  readonly product = computed(() => this.facade.creditProducts().find(p => p.id === this.selectedId()));
  readonly tracked = computed(() => this.facade.loans().filter(p => !!p.trackingStartDate));
  readonly history = signal<DebtHistory>({ obligations: [], payments: [], reconciliations: [] });
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(1);
  readonly summary = computed(() => this.product() ? debtYearSummary(this.product()!, this.history(), this.year()) : null);
  readonly selectedMonth = computed(() => this.summary()?.months[this.month() - 1]);
  readonly totals = computed(() => debtOverallTotals(this.history()));
  readonly activeAccounts = computed(() => this.facade.accounts().filter(a => !a.isArchived));
  readonly paymentObligation = signal<PeriodObligation | null>(null);
  readonly manualAllocation = signal(false);
  readonly reconciling = signal(false);
  readonly reversing = signal<ObligationPayment | null>(null);
  private registrationKey = '';
  private paymentKey = '';
  private reconciliationKey = '';
  readonly months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  readonly debtForm = this.fb.group({
    name: ['', Validators.required], institutionId: ['', Validators.required], type: ['VEHICLE_LOAN', Validators.required],
    obligationKind: ['FINANCED_DEBT', Validators.required], openingPrincipalBalance: [null as number | null, [Validators.required, Validators.min(.01)]],
    trackingStartDate: ['', Validators.required], nextDueDate: ['', Validators.required], agreedInstallment: [null as number | null, [Validators.required, Validators.min(.01)]],
    remainingInstallments: [null as number | null], nominalRateMonthly: [null as number | null], knownInterestMonthly: [0, [Validators.required, Validators.min(0)]],
    insuranceMonthly: [0, [Validators.required, Validators.min(0)]], feesMonthly: [0, [Validators.required, Validators.min(0)]], notes: [''],
  });
  readonly paymentForm = this.fb.group({ accountId: ['', Validators.required], amount: [0, [Validators.required, Validators.min(.01)]], paymentDate: ['', Validators.required], paymentType: ['REGULAR_INSTALLMENT'], capital: [0, Validators.min(0)], interest: [0, Validators.min(0)], insurance: [0, Validators.min(0)], fees: [0, Validators.min(0)], reference: [''] });
  readonly reconcileForm = this.fb.group({ statementDate: ['', Validators.required], reportedBalance: [null as number | null, [Validators.required, Validators.min(0)]], reason: ['', Validators.required] });
  readonly reversalForm = this.fb.group({ reason: ['', Validators.required] });

  constructor() {
    this.paymentForm.controls.amount.valueChanges.subscribe(() => this.syncCascadeFromAmount());
  }

  money(value: number | undefined) { return (value ?? 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }); }
  status(value: string) { return ({ ACTIVE: 'Activa', PAID_OFF: 'Saldada', PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagada', CANCELLED: 'Cancelada', DEFAULTED: 'En mora', RESTRUCTURED: 'Reestructurada' } as Record<string, string>)[value] || value; }
  entity(product: CreditProduct) { return this.institutions().find(i => i.id === product.institutionId)?.name || 'Entidad registrada'; }

  async openCreate() {
    this.message.set('');
    try { this.institutions.set(await this.accountsService.getInstitutions()); this.registrationKey = crypto.randomUUID(); this.creating.set(true); }
    catch (error: any) { this.message.set(error.message); }
  }

  async create() {
    if (this.debtForm.invalid || this.busy()) { this.debtForm.markAllAsTouched(); return; }
    this.busy.set(true);
    try {
      const v = this.debtForm.getRawValue();
      const product = await this.facade.registerExistingDebt({ name: v.name!, institutionId: v.institutionId!, type: v.type as CreditProduct['type'], obligationKind: v.obligationKind as 'FINANCED_DEBT' | 'BALANCE_COMMITMENT', openingPrincipalBalance: Number(v.openingPrincipalBalance), trackingStartDate: v.trackingStartDate!, nextDueDate: v.nextDueDate!, agreedInstallment: Number(v.agreedInstallment), remainingInstallments: v.remainingInstallments == null ? undefined : Number(v.remainingInstallments), nominalRateMonthly: v.nominalRateMonthly == null ? undefined : Number(v.nominalRateMonthly), knownInterestMonthly: Number(v.knownInterestMonthly), insuranceMonthly: Number(v.insuranceMonthly), feesMonthly: Number(v.feesMonthly), notes: v.notes || undefined, idempotencyKey: this.registrationKey });
      this.creating.set(false);
      await this.openDetail(product);
      this.message.set('Deuda registrada desde la fecha de corte.');
    } catch (error: any) { this.message.set(error.message); }
    finally { this.busy.set(false); }
  }

  async createInstitution() {
    if (this.busy() || this.institutionForm.invalid) return;
    this.busy.set(true);
    try {
      const institution = await this.accountsService.createInstitution(this.institutionForm.getRawValue().name!, 'OTHER');
      this.institutions.update(items => [...items, institution]);
      this.debtForm.patchValue({ institutionId: institution.id });
      this.institutionForm.reset();
    } catch (error: any) { this.message.set(error.message); } finally { this.busy.set(false); }
  }

  async openDetail(product: CreditProduct) {
    this.message.set('');
    try {
      const [history, institutions] = await Promise.all([this.facade.getDebtHistory(product.id), this.accountsService.getInstitutions()]);
      this.history.set(history); this.institutions.set(institutions); this.selectedId.set(product.id);
      this.year.set(Number(product.trackingStartDate!.slice(0,4))); this.month.set(Number(product.nextDueDate!.slice(5,7)));
    } catch (error: any) { this.message.set(error.message); }
  }

  async refresh() { if (this.selectedId()) this.history.set(await this.facade.getDebtHistory(this.selectedId()!)); }

  async generate() {
    if (this.busy() || !this.product()) return;
    this.busy.set(true);
    try { await this.facade.generateCreditInstallment({ creditProductId: this.product()!.id, periodYear: this.year(), periodMonth: this.month() }); await this.refresh(); this.message.set('Cuota registrada.'); }
    catch (error: any) { this.message.set(error.message); } finally { this.busy.set(false); }
  }

  openPayment(obligation: PeriodObligation, extra = false) {
    this.paymentKey = crypto.randomUUID();
    this.manualAllocation.set(false);
    this.paymentObligation.set(obligation);
    const cascade = allocatePaymentCascade(obligation, this.history().payments, extra ? 0 : obligation.amountPending);
    this.paymentForm.reset({ accountId: this.activeAccounts()[0]?.id || '', amount: extra ? 0 : obligation.amountPending, paymentDate: new Date().toISOString().slice(0,10), paymentType: extra ? 'PREPAYMENT_CAPITAL' : 'REGULAR_INSTALLMENT', capital: extra ? 0 : cascade.appliedToCapital, interest: extra ? 0 : cascade.appliedToInterest, insurance: extra ? 0 : cascade.appliedToInsurance, fees: extra ? 0 : cascade.appliedToFees, reference: '' });
    this.message.set('');
  }

  syncCascadeFromAmount() {
    const obligation = this.paymentObligation();
    if (!obligation || this.manualAllocation() || this.paymentForm.value.paymentType === 'PREPAYMENT_CAPITAL') return;
    const cascade = allocatePaymentCascade(obligation, this.history().payments, Number(this.paymentForm.controls.amount.value || 0));
    this.paymentForm.patchValue({
      capital: cascade.appliedToCapital,
      interest: cascade.appliedToInterest,
      insurance: cascade.appliedToInsurance,
      fees: cascade.appliedToFees,
    }, { emitEvent: false });
  }

  toggleManualAllocation(manual: boolean) {
    this.manualAllocation.set(manual);
    if (!manual) this.syncCascadeFromAmount();
  }

  async pay() {
    if (this.busy() || this.paymentForm.invalid || !this.paymentObligation()) return;
    this.busy.set(true);
    try {
      if (!this.manualAllocation()) this.syncCascadeFromAmount();
      const v = this.paymentForm.getRawValue();
      const isExtra = v.paymentType === 'PREPAYMENT_CAPITAL';
      const allocation = isExtra ? undefined : (this.manualAllocation() ? { appliedToCapital: Number(v.capital), appliedToInterest: Number(v.interest), appliedToInsurance: Number(v.insurance), appliedToFees: Number(v.fees) } : undefined);
      await this.facade.recordPayment({ obligationId: this.paymentObligation()!.id, accountId: v.accountId!, amount: Number(v.amount), paymentDate: v.paymentDate!, paymentType: v.paymentType as ObligationPayment['paymentType'], allocation, referenceNumber: v.reference || undefined, idempotencyKey: this.paymentKey });
      this.paymentObligation.set(null); await this.refresh(); this.message.set('Pago registrado.');
    } catch (error: any) { this.message.set(error.message); } finally { this.busy.set(false); }
  }

  openReconcile() { this.reconciliationKey = crypto.randomUUID(); this.reconcileForm.reset(); this.reconciling.set(true); }
  async reconcile() {
    if (this.busy() || this.reconcileForm.invalid || !this.product()) return;
    this.busy.set(true);
    try {
      const v = this.reconcileForm.getRawValue();
      await this.facade.reconcileDebt({ creditProductId: this.product()!.id, expectedBalance: this.product()!.currentPrincipalBalance, statementDate: v.statementDate!, reportedBalance: Number(v.reportedBalance), reason: v.reason!, idempotencyKey: this.reconciliationKey });
      this.reconciling.set(false); await this.refresh(); this.message.set('Conciliación registrada con historial auditable.');
    } catch (error: any) { this.message.set(error.message); } finally { this.busy.set(false); }
  }

  async reverse() {
    if (this.busy() || this.reversalForm.invalid || !this.reversing()) return;
    this.busy.set(true);
    try { await this.facade.reversePayment(this.reversing()!.id, this.reversalForm.getRawValue().reason!); this.reversing.set(null); await this.refresh(); this.message.set('Pago revertido; el registro se conserva.'); }
    catch (error: any) { this.message.set(error.message); } finally { this.busy.set(false); }
  }
}
