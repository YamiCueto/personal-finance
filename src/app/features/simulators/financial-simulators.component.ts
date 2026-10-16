import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FinancialFacade } from '../../core/state/financial.facade';
import { CreditProduct, PrepaymentSimulationResult, RedeferredSimulationResult } from '../../core/models/financial-v2.model';
import { FinancialCalculatorV2 } from '../../core/services/financial-calculator-v2';

@Component({
  selector: 'app-financial-simulators',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './financial-simulators.component.html',
  styleUrl: './financial-simulators.component.scss',
})
export class FinancialSimulatorsComponent {
  readonly financialFacade = inject(FinancialFacade);
  private readonly fb = inject(FormBuilder);

  readonly loans = this.financialFacade.loans;
  readonly creditProducts = this.financialFacade.creditProducts;

  readonly activeTab = signal<'prepayment' | 'redeferred'>('prepayment');

  // Estado del Simulador de Abonos Extraordinarios
  readonly prepaymentResult = signal<PrepaymentSimulationResult | null>(null);
  readonly prepaymentError = signal<string | null>(null);

  // Estado del Simulador de Rediferidos
  readonly redeferredResult = signal<RedeferredSimulationResult | null>(null);
  readonly redeferredError = signal<string | null>(null);

  readonly prepaymentForm: FormGroup = this.fb.group({
    creditId: ['', [Validators.required]],
    prepaymentAmount: [null, [Validators.required, Validators.min(1000)]],
    strategy: ['REDUCE_TERM', [Validators.required]],
  });

  readonly redeferredForm: FormGroup = this.fb.group({
    creditId: ['', [Validators.required]],
    proposedInstallments: [null, [Validators.required, Validators.min(1), Validators.max(120)]],
    rateType: ['EA', [Validators.required]],
    proposedRateValue: [null, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  readonly selectedPrepaymentCredit = computed<CreditProduct | null>(() => {
    const id = this.prepaymentForm.get('creditId')?.value;
    return this.loans().find((c) => c.id === id) || null;
  });

  readonly selectedRedeferredCredit = computed<CreditProduct | null>(() => {
    const id = this.redeferredForm.get('creditId')?.value;
    return this.creditProducts().find((c) => c.id === id) || null;
  });

  constructor() {
    // Si hay créditos disponibles, inicializar con el primer crédito
    if (this.loans().length > 0) {
      this.prepaymentForm.patchValue({ creditId: this.loans()[0].id });
      this.redeferredForm.patchValue({ creditId: this.loans()[0].id });
    }
  }

  setTab(tab: 'prepayment' | 'redeferred'): void {
    this.activeTab.set(tab);
  }

  runPrepaymentSimulation(): void {
    this.prepaymentError.set(null);
    if (this.prepaymentForm.invalid) {
      this.prepaymentForm.markAllAsTouched();
      return;
    }

    const { creditId, prepaymentAmount, strategy } = this.prepaymentForm.value;
    const credit = this.loans().find((c) => c.id === creditId);
    if (!credit) {
      this.prepaymentError.set('Seleccione un crédito válido');
      return;
    }

    const amount = Number(prepaymentAmount);
    if (amount >= credit.currentPrincipalBalance) {
      this.prepaymentError.set(
        `El abono extraordinario ($${amount.toLocaleString('es-CO')}) debe ser inferior o igual al saldo pendiente ($${credit.currentPrincipalBalance.toLocaleString('es-CO')}).`
      );
      // Even if equal, we can still simulate total cancellation
    }

    try {
      const remainingN = credit.remainingInstallments || credit.totalInstallments || 12;
      const res = this.financialFacade.simulatePrepayment(
        credit.currentPrincipalBalance,
        credit.effectiveAnnualRate,
        remainingN,
        amount,
        strategy,
        credit.associatedInsurancesMonthly || 0
      );
      this.prepaymentResult.set(res);
    } catch (err: any) {
      this.prepaymentError.set(err?.message || 'Error al ejecutar la simulación de abono');
    }
  }

  runRedeferredSimulation(): void {
    this.redeferredError.set(null);
    if (this.redeferredForm.invalid) {
      this.redeferredForm.markAllAsTouched();
      return;
    }

    const { creditId, proposedInstallments, rateType, proposedRateValue } = this.redeferredForm.value;
    const credit = this.creditProducts().find((c) => c.id === creditId);
    if (!credit) {
      this.redeferredError.set('Seleccione un producto de crédito válido');
      return;
    }

    const rateNum = Number(proposedRateValue);
    let proposedEa = rateNum;
    if (rateType === 'NMV') {
      proposedEa = FinancialCalculatorV2.convertNmvToEa(rateNum);
    }

    try {
      const remainingN = credit.remainingInstallments || credit.totalInstallments || 12;
      const res = this.financialFacade.simulateRedeferred(
        credit.currentPrincipalBalance,
        credit.effectiveAnnualRate,
        remainingN,
        proposedEa,
        Number(proposedInstallments)
      );
      this.redeferredResult.set(res);
    } catch (err: any) {
      this.redeferredError.set(err?.message || 'Error al ejecutar la simulación de rediferido');
    }
  }

  formatMoney(amount: number): string {
    return '$' + (amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
