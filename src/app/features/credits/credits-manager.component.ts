import { Component, computed, inject, signal } from '@angular/core';
import { DebtTrackerComponent } from './debt-tracker.component';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FinancialFacade } from '../../core/state/financial.facade';
import { CreditProduct, AmortizationScheduleItem } from '../../core/models/financial-v2.model';
import { FinancialCalculatorV2 } from '../../core/services/financial-calculator-v2';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-credits-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent, DebtTrackerComponent],
  templateUrl: './credits-manager.component.html',
  styleUrl: './credits-manager.component.scss',
})
export class CreditsManagerComponent {
  readonly financialFacade = inject(FinancialFacade);
  private readonly fb = inject(FormBuilder);

  readonly loans = computed(() => this.financialFacade.loans().filter(credit => !credit.trackingStartDate));
  readonly period = this.financialFacade.selectedPeriod;

  // Estados de interfaz
  readonly showCreateModal = signal<boolean>(false);
  readonly showScheduleModal = signal<boolean>(false);
  readonly selectedCreditForSchedule = signal<CreditProduct | null>(null);
  readonly scheduleMethodView = signal<'FRENCH' | 'GERMAN'>('FRENCH');
  readonly isSubmitting = signal<boolean>(false);
  readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulario de creación de crédito
  readonly creditForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    institutionId: ['inst-banco-occidente', [Validators.required]],
    type: ['CONSUMER_LOAN', [Validators.required]],
    originalPrincipal: [null, [Validators.required, Validators.min(1000)]],
    rateType: ['EA', [Validators.required]], // 'EA' o 'NMV'
    rateValue: [null, [Validators.required, Validators.min(0), Validators.max(100)]],
    totalInstallments: [12, [Validators.required, Validators.min(1), Validators.max(360)]],
    amortizationMethod: ['FRENCH', [Validators.required]],
    associatedInsurancesMonthly: [0, [Validators.min(0)]],
    paymentDueDay: [15, [Validators.required, Validators.min(1), Validators.max(31)]],
  });

  // Tasa convertida reactiva en tiempo real para el formulario
  readonly rateConversionPreview = computed(() => {
    // Calculado dinámicamente cuando el usuario escribe en el formulario
    return null;
  });

  // Cronograma de amortización del crédito seleccionado
  readonly currentSchedule = computed<AmortizationScheduleItem[]>(() => {
    const credit = this.selectedCreditForSchedule();
    if (!credit) return [];
    const method = this.scheduleMethodView();
    const principal = credit.currentPrincipalBalance;
    const rateMonthly = credit.nominalRateMonthly;
    const installments = credit.remainingInstallments || credit.totalInstallments || 12;
    const insurance = credit.associatedInsurancesMonthly || 0;

    if (method === 'GERMAN') {
      return FinancialCalculatorV2.generateGermanAmortizationSchedule(principal, rateMonthly, installments, insurance);
    }
    return FinancialCalculatorV2.generateFrenchAmortizationSchedule(principal, rateMonthly, installments, insurance);
  });

  openCreateModal(): void {
    this.creditForm.reset({
      name: '',
      institutionId: 'inst-banco-occidente',
      type: 'CONSUMER_LOAN',
      originalPrincipal: null,
      rateType: 'EA',
      rateValue: null,
      totalInstallments: 12,
      amortizationMethod: 'FRENCH',
      associatedInsurancesMonthly: 0,
      paymentDueDay: 15,
    });
    this.actionMessage.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  openScheduleModal(credit: CreditProduct): void {
    this.selectedCreditForSchedule.set(credit);
    this.scheduleMethodView.set(credit.amortizationMethod === 'GERMAN' ? 'GERMAN' : 'FRENCH');
    this.showScheduleModal.set(true);
  }

  closeScheduleModal(): void {
    this.showScheduleModal.set(false);
    this.selectedCreditForSchedule.set(null);
  }

  setScheduleMethod(method: 'FRENCH' | 'GERMAN'): void {
    this.scheduleMethodView.set(method);
  }

  async submitCreateCredit(): Promise<void> {
    if (this.creditForm.invalid) {
      this.creditForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    try {
      const val = this.creditForm.value;
      const rateType = val.rateType;
      const rateVal = Number(val.rateValue);

      let ea = 0;
      let nmv = 0;

      if (rateVal === 0) {
        ea = 0;
        nmv = 0;
      } else if (rateType === 'EA') {
        ea = rateVal;
        nmv = FinancialCalculatorV2.convertEaToNmv(ea);
      } else {
        nmv = rateVal;
        ea = FinancialCalculatorV2.convertNmvToEa(nmv);
      }

      await this.financialFacade.createCreditProduct({
        name: val.name.trim(),
        institutionId: val.institutionId,
        type: val.type,
        originalPrincipal: Number(val.originalPrincipal),
        effectiveAnnualRate: ea,
        nominalRateMonthly: nmv,
        totalInstallments: Number(val.totalInstallments),
        remainingInstallments: Number(val.totalInstallments),
        amortizationMethod: val.amortizationMethod,
        associatedInsurancesMonthly: Number(val.associatedInsurancesMonthly || 0),
        paymentDueDay: Number(val.paymentDueDay || 15),
      });

      this.actionMessage.set({
        type: 'success',
        text: `Crédito "${val.name}" registrado exitosamente con amortización ${val.amortizationMethod === 'FRENCH' ? 'francesa' : 'alemana'}.`,
      });
      this.closeCreateModal();
    } catch (err: any) {
      this.actionMessage.set({
        type: 'error',
        text: err?.message || 'Error al registrar el producto crediticio.',
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async generateMonthlyInstallment(credit: CreditProduct): Promise<void> {
    this.actionMessage.set(null);
    const { year, month } = this.period();

    const alreadyExists = this.financialFacade.periodObligations().some(
      (o) => o.creditProductId === credit.id && o.periodYear === year && o.periodMonth === month
    );
    if (alreadyExists) {
      this.actionMessage.set({
        type: 'error',
        text: `La cuota de este crédito para el período actual (${month}/${year}) ya fue generada previamente.`,
      });
      return;
    }

    try {
      const ob = await this.financialFacade.generateCreditInstallment({
        creditProductId: credit.id,
        periodYear: year,
        periodMonth: month,
      });

      this.actionMessage.set({
        type: 'success',
        text: `Cuota "${ob.name}" por $${ob.amount.toLocaleString('es-CO')} integrada exitosamente a las obligaciones de ${month}/${year} sin duplicar saldo de capital.`,
      });
    } catch (err: any) {
      this.actionMessage.set({
        type: 'error',
        text: err?.message || 'Error al generar la cuota mensual del crédito.',
      });
    }
  }

  formatMoney(amount: number | null): string {
    if (amount === null) return 'No registrado';
    return '$' + (amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
