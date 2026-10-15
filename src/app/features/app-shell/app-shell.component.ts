import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { FinancialCalculator } from '../../core/services/financial-calculator';
import { FinancialFacade } from '../../core/state/financial.facade';
import {
  FinancialAccount,
  Income,
  Obligation,
  ObligationPayment,
} from '../../core/models/financial.model';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly financialFacade = inject(FinancialFacade);

  readonly user = this.authService.currentUser;

  readonly selectedYear = signal<number>(2026);
  readonly selectedMonth = signal<number>(5);

  async ngOnInit(): Promise<void> {
    await this.financialFacade.loadPeriodData({
      year: this.selectedYear(),
      month: this.selectedMonth(),
    });
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

  // Cuentas locales sincronizadas con la Facade Financiera V2
  readonly accounts = signal<FinancialAccount[]>([
    {
      id: 'acc-bancolombia-ahorros',
      userId: 'local',
      name: 'Bancolombia Ahorros Principal',
      accountType: 'SAVINGS',
      initialBalance: 4500000,
      currentBalance: 4500000,
      color: '#0284c7',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'acc-nequi-billetera',
      userId: 'local',
      name: 'Billetera Digital Nequi',
      accountType: 'SAVINGS',
      initialBalance: 750000,
      currentBalance: 750000,
      color: '#ec4899',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  readonly incomes = signal<Income[]>([]);
  readonly obligations = signal<Obligation[]>([]);
  readonly payments = signal<ObligationPayment[]>([]);

  readonly activeTab = signal<'waterfall' | 'obligations' | 'incomes' | 'accounts'>('waterfall');

  readonly showAccountModal = signal<boolean>(false);
  readonly showIncomeModal = signal<boolean>(false);
  readonly showObligationModal = signal<boolean>(false);
  readonly showPaymentModal = signal<boolean>(false);
  readonly selectedObligationForPayment = signal<Obligation | null>(null);

  readonly accountForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    accountType: ['SAVINGS', [Validators.required]],
    initialBalance: [0, [Validators.required, Validators.min(0)]],
  });

  readonly incomeForm: FormGroup = this.fb.group({
    accountId: ['', [Validators.required]],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    description: ['', [Validators.required]],
    receivedDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
  });

  readonly obligationForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    dueDate: [''],
  });

  readonly paymentForm: FormGroup = this.fb.group({
    accountId: ['', [Validators.required]],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    paymentDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
    notes: [''],
  });

  readonly currentMonthIncomes = computed(() => {
    const y = this.selectedYear();
    const m = this.selectedMonth();
    return this.incomes().filter((inc) => inc.periodYear === y && inc.periodMonth === m);
  });

  readonly currentMonthObligations = computed(() => {
    const y = this.selectedYear();
    const m = this.selectedMonth();
    return this.obligations().filter((ob) => ob.periodYear === y && ob.periodMonth === m);
  });

  readonly monthlySummary = computed(() => {
    return FinancialCalculator.calculateMonthlySummary(
      this.selectedYear(),
      this.selectedMonth(),
      this.incomes(),
      this.obligations(),
      this.accounts()
    );
  });

  readonly waterfallItems = computed(() => {
    const totalInc = this.monthlySummary().totalIncome;
    return FinancialCalculator.calculateCascadeWaterfall(totalInc, this.currentMonthObligations());
  });

  selectMonth(month: number): void {
    this.selectedMonth.set(month);
  }

  setActiveTab(tab: 'waterfall' | 'obligations' | 'incomes' | 'accounts'): void {
    this.activeTab.set(tab);
  }

  openAccountModal(): void {
    this.accountForm.reset({ accountType: 'SAVINGS', initialBalance: 0 });
    this.showAccountModal.set(true);
  }

  closeAccountModal(): void {
    this.showAccountModal.set(false);
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }
    const val = this.accountForm.getRawValue();
    await this.financialFacade.createAccount({
      name: val.name.trim(),
      type: val.accountType,
      initialBalance: Number(val.initialBalance),
    });
    this.closeAccountModal();
  }

  openIncomeModal(): void {
    const accId = this.accounts().length > 0 ? this.accounts()[0].id : '';
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

  saveIncome(): void {
    if (this.incomeForm.invalid) {
      this.incomeForm.markAllAsTouched();
      return;
    }
    const val = this.incomeForm.getRawValue();
    const amountNum = Number(val.amount);
    const newInc: Income = {
      id: 'inc-' + Date.now(),
      userId: this.user()?.id || 'local',
      accountId: val.accountId,
      amount: amountNum,
      description: val.description.trim(),
      receivedDate: val.receivedDate,
      periodYear: this.selectedYear(),
      periodMonth: this.selectedMonth(),
      createdAt: new Date().toISOString(),
    };

    this.incomes.update((list) => [...list, newInc]);
    this.accounts.update((accList) =>
      accList.map((acc) =>
        acc.id === val.accountId
          ? { ...acc, currentBalance: acc.currentBalance + amountNum }
          : acc
      )
    );
    this.closeIncomeModal();
  }

  openObligationModal(): void {
    this.obligationForm.reset({ name: '', amount: null, dueDate: '' });
    this.showObligationModal.set(true);
  }

  closeObligationModal(): void {
    this.showObligationModal.set(false);
  }

  saveObligation(): void {
    if (this.obligationForm.invalid) {
      this.obligationForm.markAllAsTouched();
      return;
    }
    const val = this.obligationForm.getRawValue();
    const amountNum = Number(val.amount);
    const newOb: Obligation = {
      id: 'ob-' + Date.now(),
      userId: this.user()?.id || 'local',
      name: val.name.trim(),
      amount: amountNum,
      dueDate: val.dueDate || undefined,
      periodYear: this.selectedYear(),
      periodMonth: this.selectedMonth(),
      status: 'PENDING',
      amountPaid: 0,
      amountPending: amountNum,
      orderIndex: this.currentMonthObligations().length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.obligations.update((list) => [...list, newOb]);
    this.closeObligationModal();
  }

  openPaymentModal(ob: Obligation): void {
    this.selectedObligationForPayment.set(ob);
    const accId = this.accounts().length > 0 ? this.accounts()[0].id : '';
    this.paymentForm.reset({
      accountId: accId,
      amount: ob.amountPending,
      paymentDate: new Date().toISOString().substring(0, 10),
      notes: '',
    });
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void {
    this.showPaymentModal.set(false);
    this.selectedObligationForPayment.set(null);
  }

  submitPayment(): void {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const ob = this.selectedObligationForPayment();
    if (!ob) return;

    const val = this.paymentForm.getRawValue();
    const paymentAmount = Number(val.amount);

    const { updatedObligation, effectiveAmountPaid } =
      FinancialCalculator.applyPaymentToObligation(ob, paymentAmount);

    const paymentRecord: ObligationPayment = {
      id: 'pay-' + Date.now(),
      userId: this.user()?.id || 'local',
      obligationId: ob.id,
      accountId: val.accountId,
      amount: effectiveAmountPaid,
      paymentDate: val.paymentDate,
      notes: val.notes?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    this.obligations.update((list) =>
      list.map((item) => (item.id === ob.id ? updatedObligation : item))
    );
    this.payments.update((list) => [...list, paymentRecord]);
    this.accounts.update((accList) =>
      accList.map((acc) =>
        acc.id === val.accountId
          ? { ...acc, currentBalance: acc.currentBalance - effectiveAmountPaid }
          : acc
      )
    );

    this.closePaymentModal();
  }

  async onSignOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/auth/login']);
  }
}
