import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { AppShellComponent } from './app-shell.component';
import { AuthService } from '../../core/services/auth.service';
import { User } from '@supabase/supabase-js';

import { provideFinancialCore } from '../../core/providers/financial-core.provider';

registerLocaleData(localeEsCo, 'es-CO');

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;
  let mockAuthService: {
    currentUser: ReturnType<typeof signal<User | null>>;
    signOut: any;
  };
  let router: Router;

  const fakeUser: Partial<User> = {
    id: 'user-uuid-1234',
    email: 'operative@vault.secure',
  };

  beforeEach(async () => {
    mockAuthService = {
      currentUser: signal(fakeUser as User),
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        provideFinancialCore({ providerMode: 'local-demo' }),
        { provide: AuthService, useValue: mockAuthService },
        { provide: LOCALE_ID, useValue: 'es-CO' },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app shell component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the authenticated user email', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const emailEl = compiled.querySelector('[data-testid="user-email"]');
    expect(emailEl?.textContent).toContain('operative@vault.secure');
  });

  it('should call signOut and navigate to /auth/login on sign out click', async () => {
    await component.onSignOut();
    expect(mockAuthService.signOut).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should record an income successfully from the interface and update liquid balance', async () => {
    component.openIncomeModal();
    expect(component.showIncomeModal()).toBe(true);

    const initialLiquid = component.totalLiquidBalance();
    const accountId = component.accounts()[0].id;

    component.incomeForm.patchValue({
      accountId,
      amount: 1200000,
      description: 'Consultoría Especial',
      receivedDate: '2026-10-15',
    });

    await component.saveIncome();

    expect(component.showIncomeModal()).toBe(false);
    expect(component.totalLiquidBalance()).toBe(initialLiquid + 1200000);
    expect(component.actionSuccess()).toContain('registrado exitosamente');
  });

  it('should create a new period obligation and update the monthly waterfall', async () => {
    component.openObligationModal();
    expect(component.showObligationModal()).toBe(true);

    const initialCount = component.obligations().length;

    component.obligationForm.patchValue({
      name: 'Suscripción Gimnasio',
      amount: 150000,
      sourceType: 'RECURRENT_EXPENSE',
      dueDate: '2026-10-25',
    });

    await component.saveObligation();

    expect(component.showObligationModal()).toBe(false);
    expect(component.obligations().length).toBe(initialCount + 1);
    expect(component.actionSuccess()).toContain('creada por');
  });

  it('should process a partial and full payment of an obligation and update pending balance', async () => {
    // 1. Crear una obligación para pagar
    component.obligationForm.patchValue({
      name: 'Plan Móvil Pospago',
      amount: 80000,
      sourceType: 'RECURRENT_EXPENSE',
    });
    await component.saveObligation();

    const ob = component.obligations().find((o) => o.name === 'Plan Móvil Pospago')!;
    expect(ob).toBeDefined();

    // 2. Abrir modal y realizar pago parcial de $30.000
    component.openPaymentModal(ob);
    expect(component.showPaymentModal()).toBe(true);

    const account = component.accounts()[0];
    component.paymentForm.patchValue({
      accountId: account.id,
      amount: 30000,
      paymentMode: 'PARTIAL',
    });

    await component.submitPayment();
    expect(component.showPaymentModal()).toBe(false);

    const updatedOb = component.obligations().find((o) => o.id === ob.id)!;
    expect(updatedOb.amountPaid).toBe(30000);
    expect(updatedOb.amountPending).toBe(50000);
    expect(updatedOb.status).toBe('PARTIAL');

    // 3. Pagar el resto ($50.000)
    component.openPaymentModal(updatedOb);
    component.paymentForm.patchValue({
      accountId: account.id,
      amount: 50000,
      paymentMode: 'TOTAL',
    });

    await component.submitPayment();
    const fullyPaidOb = component.obligations().find((o) => o.id === ob.id)!;
    expect(fullyPaidOb.amountPaid).toBe(80000);
    expect(fullyPaidOb.amountPending).toBe(0);
    expect(fullyPaidOb.status).toBe('PAID');
  });

  it('should reject payment with insufficient funds or overpayment', async () => {
    component.obligationForm.patchValue({
      name: 'Seguro Excedente',
      amount: 100000,
      sourceType: 'RECURRENT_EXPENSE',
    });
    await component.saveObligation();

    const ob = component.obligations().find((o) => o.name === 'Seguro Excedente')!;
    component.openPaymentModal(ob);

    // Intentar sobrepago: $200.000 cuando la obligación es de $100.000
    const account = component.accounts()[0];
    component.paymentForm.patchValue({
      accountId: account.id,
      amount: 200000,
    });

    await component.submitPayment();
    expect(component.actionError()).toContain('excede el saldo pendiente');
  });

  it('should reset demo scenario to initial state on resetDemoScenario call', async () => {
    await component.resetDemoScenario();
    expect(component.actionSuccess()).toContain('Escenario local reiniciado con éxito');
    expect(component.accounts().length).toBeGreaterThan(0);
  });

  it('should switch selected month dynamically and update facade period', async () => {
    await component.selectMonth(7);
    expect(component.selectedMonth()).toBe(7);
    expect(component.financialFacade.selectedPeriod().month).toBe(7);
  });
});
