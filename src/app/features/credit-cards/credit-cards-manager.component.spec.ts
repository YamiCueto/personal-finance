import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CreditCardsManagerComponent } from './credit-cards-manager.component';
import { FinancialFacade } from '../../core/state/financial.facade';
import { LocalFinancialAdapter } from '../../core/repositories/local-financial.adapter';
import {
  CREDIT_PRODUCT_REPOSITORY,
  FINANCIAL_ACCOUNT_REPOSITORY,
  INCOME_REPOSITORY,
  PERIOD_OBLIGATION_REPOSITORY,
  TRANSACTIONAL_OPERATION_REPOSITORY,
} from '../../core/repositories/financial-repositories.contract';
import { AuthService } from '../../core/services/auth.service';
import { FINANCIAL_CONFIG } from '../../core/config/financial.config';
import { signal } from '@angular/core';

describe('CreditCardsManagerComponent — UI y Lógica de Tarjetas y Compras Diferidas', () => {
  let component: CreditCardsManagerComponent;
  let fixture: ComponentFixture<CreditCardsManagerComponent>;
  let facade: FinancialFacade;
  let adapter: LocalFinancialAdapter;

  const mockAuthService = {
    currentUser: signal({ id: 'test-user-cards-ui', email: 'test-cards@vault.internal' }),
  };

  beforeEach(async () => {
    adapter = new LocalFinancialAdapter();
    adapter.resetUserScenario('test-user-cards-ui');

    await TestBed.configureTestingModule({
      imports: [CreditCardsManagerComponent],
      providers: [
        FinancialFacade,
        { provide: CREDIT_PRODUCT_REPOSITORY, useValue: adapter },
        { provide: FINANCIAL_ACCOUNT_REPOSITORY, useValue: adapter },
        { provide: PERIOD_OBLIGATION_REPOSITORY, useValue: adapter },
        { provide: INCOME_REPOSITORY, useValue: adapter },
        { provide: TRANSACTIONAL_OPERATION_REPOSITORY, useValue: adapter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: FINANCIAL_CONFIG, useValue: { providerMode: 'local-demo' } },
      ],
    }).compileComponents();

    facade = TestBed.inject(FinancialFacade);
    await facade.loadPeriodData({ year: 2026, month: 5 });

    fixture = TestBed.createComponent(CreditCardsManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe inicializarse y listar las tarjetas sembradas (Tarjeta A y Tarjeta B)', () => {
    expect(component).toBeTruthy();
    expect(component.creditCards().length).toBeGreaterThanOrEqual(2);
  });

  it('debe calcular correctamente el porcentaje de uso de cupo', () => {
    const card = component.creditCards()[0]; // 10M aprobado, 4.85M utilizado -> ~49%
    const usage = component.calculateUsagePercent(card);
    expect(usage).toBeGreaterThanOrEqual(45);
    expect(usage).toBeLessThanOrEqual(55);
  });

  it('debe listar compras diferidas asociadas a la tarjeta A', () => {
    const cardA = component.creditCards().find((c) => c.name.includes('Visa'));
    expect(cardA).toBeDefined();

    const purchases = component.getPurchasesForCard(cardA!.id);
    expect(purchases.length).toBeGreaterThanOrEqual(2);
  });

  it('debe rechazar una compra en la UI si el monto excede el cupo disponible', async () => {
    const card = component.creditCards()[0];
    component.openAddPurchaseModal(card);

    component.purchaseForm.patchValue({
      description: 'Compra que excede cupo',
      amount: 999999999, // Excede cualquier cupo
      totalInstallments: 12,
    });

    await component.submitCreatePurchase();

    expect(component.actionMessage()?.type).toBe('error');
    expect(component.actionMessage()?.text).toContain('excede el cupo disponible');
  });

  it('debe generar el extracto mensual de la tarjeta de crédito', async () => {
    const card = component.creditCards()[0];
    await component.generateStatementObligation(card);

    expect(component.actionMessage()?.type).toBe('success');
    expect(component.actionMessage()?.text).toContain('integrado exitosamente');
  });
});
