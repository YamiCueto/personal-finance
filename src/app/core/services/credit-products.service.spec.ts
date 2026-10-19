import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CreditProductsService } from './credit-products.service';
import { CREDIT_PRODUCT_REPOSITORY } from '../repositories/financial-repositories.contract';
import { LocalFinancialAdapter } from '../repositories/local-financial.adapter';
import { AuthService } from './auth.service';
import { signal } from '@angular/core';

describe('CreditProductsService — Gestión de Créditos, Tarjetas e Integración', () => {
  let service: CreditProductsService;
  let adapter: LocalFinancialAdapter;

  const mockAuthService = {
    currentUser: signal({ id: 'test-user-fase3', email: 'test3@vault.internal' }),
  };

  beforeEach(() => {
    adapter = new LocalFinancialAdapter();
    adapter.resetUserScenario('test-user-fase3');

    TestBed.configureTestingModule({
      providers: [
        CreditProductsService,
        { provide: CREDIT_PRODUCT_REPOSITORY, useValue: adapter },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(CreditProductsService);
  });

  it('debe registrar un crédito vehicular con tasa positiva y sistema francés (Crédito A)', async () => {
    const credit = await service.createCreditProduct({
      name: 'Crédito Vehículo Occidente',
      type: 'VEHICLE_LOAN',
      originalPrincipal: 40000000,
      effectiveAnnualRate: 18.86,
      nominalRateMonthly: 1.45,
      totalInstallments: 60,
      amortizationMethod: 'FRENCH',
      associatedInsurancesMonthly: 45000,
    });

    expect(credit.id).toBeDefined();
    expect(credit.name).toBe('Crédito Vehículo Occidente');
    expect(credit.currentPrincipalBalance).toBe(40000000);
    expect(credit.amortizationMethod).toBe('FRENCH');
    expect(credit.effectiveAnnualRate).toBe(18.86);
  });

  it('debe registrar un crédito con tasa cero para casos límite (Crédito B)', async () => {
    const creditZero = await service.createCreditProduct({
      name: 'Préstamo Empresa Sin Interés',
      type: 'CONSUMER_LOAN',
      originalPrincipal: 6000000,
      effectiveAnnualRate: 0,
      nominalRateMonthly: 0,
      totalInstallments: 12,
      amortizationMethod: 'FRENCH',
      associatedInsurancesMonthly: 0,
    });

    expect(creditZero.effectiveAnnualRate).toBe(0);
    expect(creditZero.nominalRateMonthly).toBe(0);
    expect(creditZero.currentPrincipalBalance).toBe(6000000);
  });

  it('debe registrar una tarjeta de crédito con cupo aprobado y validar cupo disponible', async () => {
    const card = await service.createCreditProduct({
      name: 'Visa Signature Life',
      type: 'CREDIT_CARD',
      originalPrincipal: 0,
      approvedCreditLimit: 12000000,
      effectiveAnnualRate: 28.5,
      nominalRateMonthly: 2.1,
      statementCutoffDay: 18,
      paymentDueDay: 5,
      managementFeeMonthly: 25000,
    });

    expect(card.type).toBe('CREDIT_CARD');
    expect(card.approvedCreditLimit).toBe(12000000);
    expect(card.usedCreditLimit).toBe(0);
    expect(card.availableCreditLimit).toBe(12000000);
  });

  it('debe rechazar registrar una tarjeta con cupo menor o igual a cero', async () => {
    await expect(
      service.createCreditProduct({
        name: 'Tarjeta Inválida',
        type: 'CREDIT_CARD',
        originalPrincipal: 0,
        approvedCreditLimit: 0,
        effectiveAnnualRate: 25,
        nominalRateMonthly: 1.8,
      })
    ).rejects.toThrow(/cupo aprobado/i);
  });

  it('debe registrar compras diferidas y actualizar el cupo disponible de la tarjeta', async () => {
    const card = await service.createCreditProduct({
      name: 'Mastercard Platinum Test',
      type: 'CREDIT_CARD',
      originalPrincipal: 0,
      approvedCreditLimit: 5000000,
      effectiveAnnualRate: 26.0,
      nominalRateMonthly: 1.95,
    });

    const purchase = await service.createCreditCardPurchase({
      creditCardId: card.id,
      description: 'Celular Gama Alta',
      amount: 2000000,
      totalInstallments: 12,
    });

    expect(purchase.id).toBeDefined();
    expect(purchase.originalAmount).toBe(2000000);

    // Verificar que el cupo de la tarjeta se actualizó en el repositorio
    const updatedCard = await service.getCreditProductById(card.id);
    expect(updatedCard?.usedCreditLimit).toBe(2000000);
    expect(updatedCard?.availableCreditLimit).toBe(3000000);
  });

  it('debe rechazar una compra diferida si supera el cupo disponible', async () => {
    const card = await service.createCreditProduct({
      name: 'Visa Limitada',
      type: 'CREDIT_CARD',
      originalPrincipal: 0,
      approvedCreditLimit: 1000000,
      effectiveAnnualRate: 25.0,
      nominalRateMonthly: 1.8,
    });

    await expect(
      service.createCreditCardPurchase({
        creditCardId: card.id,
        description: 'Televisor OLED 4K',
        amount: 2500000, // Supera el cupo de 1,000,000
        totalInstallments: 24,
      })
    ).rejects.toThrow(/supera el cupo disponible/i);
  });

  it('debe generar la cuota mensual del crédito de forma idempotente sin duplicar deuda', async () => {
    const credit = await service.createCreditProduct({
      name: 'Crédito Occidente Idempotencia',
      type: 'VEHICLE_LOAN',
      originalPrincipal: 30000000,
      effectiveAnnualRate: 18.0,
      nominalRateMonthly: 1.39,
      totalInstallments: 36,
      amortizationMethod: 'FRENCH',
      associatedInsurancesMonthly: 30000,
    });

    // Generar cuota para 2026-06
    const ob1 = await service.generateCreditInstallmentObligation({
      creditProductId: credit.id,
      periodYear: 2026,
      periodMonth: 6,
    });

    expect(ob1.id).toBeDefined();
    expect(ob1.creditProductId).toBe(credit.id);
    expect(ob1.amount).toBeGreaterThan(0);
    expect(ob1.status).toBe('PENDING');

    // El capital adeudado en el crédito NO debe aumentar
    const creditAfterOb = await service.getCreditProductById(credit.id);
    expect(creditAfterOb?.currentPrincipalBalance).toBe(30000000);

    // Segundo llamado con los mismos parámetros debe retornar exactamente la misma obligación (idempotencia)
    const ob2 = await service.generateCreditInstallmentObligation({
      creditProductId: credit.id,
      periodYear: 2026,
      periodMonth: 6,
    });

    expect(ob2.id).toBe(ob1.id);
    expect(ob2.amount).toBe(ob1.amount);
  });
});
