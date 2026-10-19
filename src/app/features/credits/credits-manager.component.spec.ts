import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CreditsManagerComponent } from './credits-manager.component';
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

describe('CreditsManagerComponent — UI y Lógica de Créditos', () => {
  let component: CreditsManagerComponent;
  let fixture: ComponentFixture<CreditsManagerComponent>;
  let facade: FinancialFacade;
  let adapter: LocalFinancialAdapter;

  const mockAuthService = {
    currentUser: signal({ id: 'test-user-ui', email: 'test-ui@vault.internal' }),
  };

  beforeEach(async () => {
    adapter = new LocalFinancialAdapter();
    adapter.resetUserScenario('test-user-ui');

    await TestBed.configureTestingModule({
      imports: [CreditsManagerComponent],
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

    fixture = TestBed.createComponent(CreditsManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe inicializarse y listar los créditos activos de la semilla', () => {
    expect(component).toBeTruthy();
    expect(component.loans().length).toBeGreaterThanOrEqual(2); // Crédito Vehículo y Crédito Tasa Cero
  });

  it('debe abrir y cerrar el modal de creación de crédito', () => {
    component.openCreateModal();
    expect(component.showCreateModal()).toBe(true);

    component.closeCreateModal();
    expect(component.showCreateModal()).toBe(false);
  });

  it('debe abrir el modal de tabla de amortización y alternar entre sistema francés y alemán', () => {
    const loan = component.loans()[0];
    component.openScheduleModal(loan);

    expect(component.showScheduleModal()).toBe(true);
    expect(component.selectedCreditForSchedule()?.id).toBe(loan.id);

    // Sistema Francés por defecto
    const frenchSchedule = component.currentSchedule();
    expect(frenchSchedule.length).toBeGreaterThan(0);
    expect(frenchSchedule[frenchSchedule.length - 1].remainingPrincipal).toBe(0);

    // Cambiar a Sistema Alemán
    component.setScheduleMethod('GERMAN');
    expect(component.scheduleMethodView()).toBe('GERMAN');
    const germanSchedule = component.currentSchedule();
    expect(germanSchedule.length).toBe(frenchSchedule.length);
    expect(germanSchedule[germanSchedule.length - 1].remainingPrincipal).toBe(0);
  });

  it('debe generar la cuota mensual del crédito e integrarla a las obligaciones', async () => {
    // loans()[1] es Crédito Educativo (sin cuota preexistente en el mes actual)
    const loan = component.loans()[1];
    await component.generateMonthlyInstallment(loan);

    expect(component.actionMessage()?.type).toBe('success');
    expect(component.actionMessage()?.text).toContain('integrada exitosamente');

    // Reintento idempotente: debe informar que ya fue generada previamente
    await component.generateMonthlyInstallment(loan);
    expect(component.actionMessage()?.type).toBe('error');
    expect(component.actionMessage()?.text).toContain('ya fue generada previamente');
  });
});
