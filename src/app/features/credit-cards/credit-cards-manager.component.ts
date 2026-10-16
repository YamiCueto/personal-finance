import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FinancialFacade } from '../../core/state/financial.facade';
import { CreditProduct, CreditCardPurchase } from '../../core/models/financial-v2.model';
import { FinancialCalculatorV2 } from '../../core/services/financial-calculator-v2';

@Component({
  selector: 'app-credit-cards-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './credit-cards-manager.component.html',
  styleUrl: './credit-cards-manager.component.scss',
})
export class CreditCardsManagerComponent {
  readonly financialFacade = inject(FinancialFacade);
  private readonly fb = inject(FormBuilder);

  readonly creditCards = this.financialFacade.creditCards;
  readonly allPurchases = this.financialFacade.creditCardPurchases;
  readonly period = this.financialFacade.selectedPeriod;

  // Modales y estados
  readonly showCreateCardModal = signal<boolean>(false);
  readonly showAddPurchaseModal = signal<boolean>(false);
  readonly selectedCardForPurchase = signal<CreditProduct | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulario: Nueva Tarjeta de Crédito
  readonly cardForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    institutionId: ['inst-banco-occidente', [Validators.required]],
    approvedCreditLimit: [null, [Validators.required, Validators.min(100000)]],
    rateType: ['EA', [Validators.required]],
    rateValue: [null, [Validators.required, Validators.min(0), Validators.max(100)]],
    statementCutoffDay: [18, [Validators.required, Validators.min(1), Validators.max(31)]],
    paymentDueDay: [5, [Validators.required, Validators.min(1), Validators.max(31)]],
    managementFeeMonthly: [0, [Validators.min(0)]],
  });

  // Formulario: Nueva Compra Diferida
  readonly purchaseForm: FormGroup = this.fb.group({
    description: ['', [Validators.required, Validators.minLength(3)]],
    amount: [null, [Validators.required, Validators.min(1000)]],
    totalInstallments: [1, [Validators.required, Validators.min(1), Validators.max(48)]],
    purchaseDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
    customRate: [null, [Validators.min(0), Validators.max(100)]],
  });

  openCreateCardModal(): void {
    this.cardForm.reset({
      name: '',
      institutionId: 'inst-banco-occidente',
      approvedCreditLimit: null,
      rateType: 'EA',
      rateValue: null,
      statementCutoffDay: 18,
      paymentDueDay: 5,
      managementFeeMonthly: 0,
    });
    this.actionMessage.set(null);
    this.showCreateCardModal.set(true);
  }

  closeCreateCardModal(): void {
    this.showCreateCardModal.set(false);
  }

  openAddPurchaseModal(card: CreditProduct): void {
    this.selectedCardForPurchase.set(card);
    this.purchaseForm.reset({
      description: '',
      amount: null,
      totalInstallments: 1,
      purchaseDate: new Date().toISOString().substring(0, 10),
      customRate: card.nominalRateMonthly,
    });
    this.actionMessage.set(null);
    this.showAddPurchaseModal.set(true);
  }

  closeAddPurchaseModal(): void {
    this.showAddPurchaseModal.set(false);
    this.selectedCardForPurchase.set(null);
  }

  getPurchasesForCard(cardId: string): CreditCardPurchase[] {
    return this.allPurchases().filter((p) => p.productId === cardId);
  }

  async submitCreateCard(): Promise<void> {
    if (this.cardForm.invalid) {
      this.cardForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    try {
      const val = this.cardForm.value;
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
        type: 'CREDIT_CARD',
        originalPrincipal: 0,
        approvedCreditLimit: Number(val.approvedCreditLimit),
        effectiveAnnualRate: ea,
        nominalRateMonthly: nmv,
        statementCutoffDay: Number(val.statementCutoffDay),
        paymentDueDay: Number(val.paymentDueDay),
        managementFeeMonthly: Number(val.managementFeeMonthly || 0),
        amortizationMethod: 'FRENCH',
      });

      this.actionMessage.set({
        type: 'success',
        text: `Tarjeta "${val.name}" registrada con cupo de $${Number(val.approvedCreditLimit).toLocaleString('es-CO')} COP.`,
      });
      this.closeCreateCardModal();
    } catch (err: any) {
      this.actionMessage.set({
        type: 'error',
        text: err?.message || 'Error al registrar la tarjeta de crédito.',
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitCreatePurchase(): Promise<void> {
    const card = this.selectedCardForPurchase();
    if (!card) return;

    if (this.purchaseForm.invalid) {
      this.purchaseForm.markAllAsTouched();
      return;
    }

    const val = this.purchaseForm.value;
    const amount = Number(val.amount);
    const available = card.availableCreditLimit ?? ((card.approvedCreditLimit || 0) - (card.usedCreditLimit || 0));

    // Regla de integridad: No permitir compras superiores al cupo disponible
    if (amount > available) {
      this.actionMessage.set({
        type: 'error',
        text: `El monto ($${amount.toLocaleString('es-CO')}) excede el cupo disponible de la tarjeta ($${available.toLocaleString('es-CO')}).`,
      });
      return;
    }

    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    try {
      await this.financialFacade.createCreditCardPurchase({
        creditCardId: card.id,
        description: val.description.trim(),
        amount,
        totalInstallments: Number(val.totalInstallments),
        purchaseDate: val.purchaseDate,
        interestRateMonthly: val.customRate !== null ? Number(val.customRate) : undefined,
      });

      this.actionMessage.set({
        type: 'success',
        text: `Compra "${val.description}" diferida a ${val.totalInstallments} cuota(s) registrada exitosamente en "${card.name}".`,
      });
      this.closeAddPurchaseModal();
    } catch (err: any) {
      this.actionMessage.set({
        type: 'error',
        text: err?.message || 'Error al registrar la compra diferida.',
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async generateStatementObligation(card: CreditProduct): Promise<void> {
    this.actionMessage.set(null);
    const { year, month } = this.period();

    const alreadyExists = this.financialFacade.periodObligations().some(
      (o) => o.creditProductId === card.id && o.periodYear === year && o.periodMonth === month
    );
    if (alreadyExists) {
      this.actionMessage.set({
        type: 'error',
        text: `El extracto de esta tarjeta para el período actual (${month}/${year}) ya fue generado previamente.`,
      });
      return;
    }

    try {
      const ob = await this.financialFacade.generateCreditInstallment({
        creditProductId: card.id,
        periodYear: year,
        periodMonth: month,
      });

      this.actionMessage.set({
        type: 'success',
        text: `Extracto "${ob.name}" por $${ob.amount.toLocaleString('es-CO')} integrado exitosamente a las obligaciones de ${month}/${year}.`,
      });
    } catch (err: any) {
      this.actionMessage.set({
        type: 'error',
        text: err?.message || 'Error al generar el extracto mensual de la tarjeta.',
      });
    }
  }

  calculateUsagePercent(card: CreditProduct): number {
    const approved = card.approvedCreditLimit || 1;
    const used = card.usedCreditLimit ?? card.currentPrincipalBalance ?? 0;
    return Math.min(100, Math.round((used / approved) * 100));
  }

  formatMoney(amount: number): string {
    return '$' + (amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
