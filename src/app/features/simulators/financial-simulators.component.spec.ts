import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FinancialSimulatorsComponent } from './financial-simulators.component';
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

describe('FinancialSimulatorsComponent — UI y Lógica de Simuladores', () => {
  let component: FinancialSimulatorsComponent;
  let fixture: ComponentFixture<FinancialSimulatorsComponent>;
  let facade: FinancialFacade;
  let adapter: LocalFinancialAdapter;

  const mockAuthService = {
    currentUser: signal({ id: 'test-user-sim-ui', email: 'test-sim@vault.internal' }),
  };

  beforeEach(async () => {
    adapter = new LocalFinancialAdapter();
    adapter.resetUserScenario('test-user-sim-ui');

    await TestBed.configureTestingModule({
      imports: [FinancialSimulatorsComponent],
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

    fixture = TestBed.createComponent(FinancialSimulatorsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe inicializarse con la pestaña de abonos extraordinarios activa', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('prepayment');
  });

  it('debe alternar entre pestañas de abonos extraordinarios y rediferidos', () => {
    component.setTab('redeferred');
    expect(component.activeTab()).toBe('redeferred');

    component.setTab('prepayment');
    expect(component.activeTab()).toBe('prepayment');
  });

  it('debe ejecutar una simulación de abono extraordinario sin alterar los saldos reales de la fachada', () => {
    const loan = component.loans()[0];
    const initialRealBalance = loan.currentPrincipalBalance;

    component.prepaymentForm.patchValue({
      creditId: loan.id,
      prepaymentAmount: 5000000,
      strategy: 'REDUCE_TERM',
    });

    component.runPrepaymentSimulation();

    const res = component.prepaymentResult();
    expect(res).not.toBeNull();
    expect(res?.previousPrincipal).toBe(initialRealBalance);
    expect(res?.simulatedPrincipal).toBe(initialRealBalance - 5000000);
    expect(res?.estimatedInterestSavings).toBeGreaterThan(0);

    // Invariante de seguridad: El saldo real del crédito en la fachada NO debe haber cambiado
    expect(loan.currentPrincipalBalance).toBe(initialRealBalance);
  });

  it('debe ejecutar una simulación de rediferido comparando costos sin aplicar reestructuración real', () => {
    const loan = component.loans()[0];
    const initialStatus = loan.status;

    component.setTab('redeferred');
    component.redeferredForm.patchValue({
      creditId: loan.id,
      proposedInstallments: 36,
      rateType: 'EA',
      proposedRateValue: 22.0,
    });

    component.runRedeferredSimulation();

    const res = component.redeferredResult();
    expect(res).not.toBeNull();
    expect(res?.proposedInstallments).toBe(36);
    expect(res?.totalCostDifference).toBeDefined();

    // Invariante de seguridad: El estado del producto NO debe haber cambiado a RESTRUCTURED
    expect(loan.status).toBe(initialStatus);
  });
});
