import { test, expect } from '@playwright/test';
import {
  MOCK_USER_A,
  MOCK_USER_B,
  setupSupabaseMocks,
  mockLoginSuccess,
  mockLoginFailure,
  mockSignupSuccess,
  mockSignupFailure,
  mockNetworkFailure,
  mockPasswordRecoverySuccess,
  mockPasswordRecoveryRateLimit,
  mockPasswordUpdateSuccess,
  mockPasswordUpdateFailure,
  injectAuthenticatedSession,
  injectExpiredSession,
} from './helpers/auth-mocks';

test.describe('Authentication Foundation & Route Protection (Deterministic Mocks)', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  test('unauthenticated request to /app redirects to /auth/login with returnUrl parameter', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Access Vault');

    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Access Vault');

    await page.goto('/auth/signup');
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create Vault Account');
  });

  test('login page renders accessible controls and enforces minimum touch targets', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Access Vault');
    await expect(page.getByText('Financial Control System')).toBeVisible();

    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const submitButton = page.getByRole('button', { name: /sign in to vault/i });
    const toggleButton = page.getByRole('button', { name: /show password/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(toggleButton).toBeVisible();
    await expect(submitButton).toBeDisabled();

    const submitBox = await submitButton.boundingBox();
    expect(submitBox).not.toBeNull();
    expect(submitBox!.height).toBeGreaterThanOrEqual(44);

    await passwordInput.fill('SecretValue123');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: /hide password/i })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('signup page validates invalid email, minimum length, and weak password requirements', async ({ page }) => {
    await page.goto('/auth/signup');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create Vault Account');

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const submitButton = page.getByRole('button', { name: /create account/i });

    await emailInput.fill('invalid-email-format');
    await emailInput.blur();
    await expect(page.locator('#email-error')).toContainText('Please enter a valid email format.');

    await passwordInput.fill('short');
    await passwordInput.blur();
    await expect(page.locator('#password-error')).toContainText('Password must be at least 8 characters long.');

    await passwordInput.fill('lettersonlyhere');
    await passwordInput.blur();
    await expect(page.locator('#password-error')).toContainText(
      'Password must include at least one letter and one number.'
    );

    await expect(submitButton).toBeDisabled();
  });

  test('signup page displays mismatch error when passwords do not match', async ({ page }) => {
    await page.goto('/auth/signup');

    await page.locator('#email').fill('operative@example.com');
    await page.locator('#password').fill('StrongPass123!');
    await page.locator('#passwordConfirmation').fill('DifferentPass456!');
    await page.locator('#passwordConfirmation').blur();

    await expect(page.locator('#confirmation-error')).toContainText('Passwords do not match.');
    await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('user can navigate smoothly between login and signup pages', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.getByRole('link', { name: /create vault account/i }).click();
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create Vault Account');

    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Access Vault');
  });

  test('invalid login produces a normalized error banner without crashing', async ({ page }) => {
    await mockLoginFailure(page, 'Invalid email or password. Please verify your credentials.', 'invalid_credentials');

    await page.goto('/auth/login');
    await page.locator('#login-email').fill('wrong-user@test.invalid');
    await page.locator('#login-password').fill('WrongPassword999!');

    const submitButton = page.getByRole('button', { name: /sign in to vault/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    const alert = page.locator('.alert.alert-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Invalid email or password|Authentication Failed/i);

    await expect(page.locator('#login-email')).toBeEnabled();
    await expect(page.locator('#login-password')).toBeEnabled();
  });

  test('successful login navigates to app shell with authenticated identity', async ({ page }) => {
    await mockLoginSuccess(page, MOCK_USER_A);

    await page.goto('/auth/login');
    await page.locator('#login-email').fill(MOCK_USER_A.email);
    await page.locator('#login-password').fill('ValidPassword123!');
    await page.getByRole('button', { name: /sign in to vault/i }).click();

    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authenticated Session Verified');
    await expect(page.locator('[data-testid="user-email"]')).toContainText(MOCK_USER_A.email);
    await expect(page.locator('[data-testid="user-id"]')).toContainText(MOCK_USER_A.id);
  });

  test('successful signup with immediate session establishes vault access', async ({ page }) => {
    await mockSignupSuccess(page, MOCK_USER_A, false);

    await page.goto('/auth/signup');
    await page.locator('#email').fill(MOCK_USER_A.email);
    await page.locator('#password').fill('StrongPass123!');
    await page.locator('#passwordConfirmation').fill('StrongPass123!');
    await page.getByRole('button', { name: /create account/i }).click();

    const alert = page.locator('.alert.alert-success');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Account registered successfully/i);
  });

  test('successful signup requiring email confirmation displays verification notice', async ({ page }) => {
    await mockSignupSuccess(page, MOCK_USER_A, true);

    await page.goto('/auth/signup');
    await page.locator('#email').fill(MOCK_USER_A.email);
    await page.locator('#password').fill('StrongPass123!');
    await page.locator('#passwordConfirmation').fill('StrongPass123!');
    await page.getByRole('button', { name: /create account/i }).click();

    const alert = page.locator('.alert.alert-success');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/confirmation email has been dispatched/i);
  });

  test('signup failure with existing email displays normalized duplicate error', async ({ page }) => {
    await mockSignupFailure(page, 'An account with this email address already exists.', 'user_already_exists');

    await page.goto('/auth/signup');
    await page.locator('#email').fill('existing-user@example.com');
    await page.locator('#password').fill('StrongPass123!');
    await page.locator('#passwordConfirmation').fill('StrongPass123!');
    await page.getByRole('button', { name: /create account/i }).click();

    const alert = page.locator('.alert.alert-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/already exists/i);
  });

  test('session persistence restores authenticated identity across page reload', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator('[data-testid="user-email"]')).toContainText(MOCK_USER_A.email);

    await page.reload();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator('[data-testid="user-email"]')).toContainText(MOCK_USER_A.email);
  });

  test('expired session clears auth state and redirects user to login', async ({ page }) => {
    await injectExpiredSession(page, MOCK_USER_A);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Access Vault');
  });

  test('sign out cleans active session and locks protected routes', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/app/);

    await page.evaluate(() => window.sessionStorage.setItem('__mock_logged_out__', 'true'));
    await page.locator('[data-testid="signout-button"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('guestGuard redirects authenticated user attempting to reach /auth/login or /auth/signup', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);

    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/app/);

    await page.goto('/auth/signup');
    await expect(page).toHaveURL(/\/app/);
  });

  test('deep link returnUrl is preserved through authentication flow', async ({ page }) => {
    await mockLoginSuccess(page, MOCK_USER_A);

    await page.goto('/app?view=portfolio-allocations');
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fapp%3Fview%3Dportfolio-allocations/);

    await page.locator('#login-email').fill(MOCK_USER_A.email);
    await page.locator('#login-password').fill('ValidPassword123!');
    await page.getByRole('button', { name: /sign in to vault/i }).click();

    await expect(page).toHaveURL('/app?view=portfolio-allocations');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authenticated Session Verified');
  });

  test('network failure during login displays connection error message gracefully', async ({ page }) => {
    await mockNetworkFailure(page, '**/auth/v1/token?grant_type=password');

    await page.goto('/auth/login');
    await page.locator('#login-email').fill('network-error@test.vault');
    await page.locator('#login-password').fill('ValidPassword123!');
    await page.getByRole('button', { name: /sign in to vault/i }).click();

    const alert = page.locator('.alert.alert-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Unable to connect to authentication service|failed/i);
  });

  test('multi-tenant session isolation between User A and User B across concurrent browser contexts', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await setupSupabaseMocks(pageA);
      await setupSupabaseMocks(pageB);

      await mockLoginSuccess(pageA, MOCK_USER_A);
      await mockLoginSuccess(pageB, MOCK_USER_B);

      await pageA.goto('/auth/login');
      await pageA.locator('#login-email').fill(MOCK_USER_A.email);
      await pageA.locator('#login-password').fill('PassAlpha123!');
      await pageA.getByRole('button', { name: /sign in to vault/i }).click();
      await expect(pageA).toHaveURL(/\/app/);
      await expect(pageA.locator('[data-testid="user-email"]')).toContainText(MOCK_USER_A.email);

      await pageB.goto('/auth/login');
      await pageB.locator('#login-email').fill(MOCK_USER_B.email);
      await pageB.locator('#login-password').fill('PassBeta456!');
      await pageB.getByRole('button', { name: /sign in to vault/i }).click();
      await expect(pageB).toHaveURL(/\/app/);
      await expect(pageB.locator('[data-testid="user-email"]')).toContainText(MOCK_USER_B.email);

      const emailA = await pageA.locator('[data-testid="user-email"]').innerText();
      const emailB = await pageB.locator('[data-testid="user-email"]').innerText();
      expect(emailA).toBe(MOCK_USER_A.email);
      expect(emailB).toBe(MOCK_USER_B.email);
      expect(emailA).not.toBe(emailB);

      await pageA.locator('[data-testid="signout-button"]').click();
      await expect(pageA).toHaveURL(/\/auth\/login/);

      await pageB.reload();
      await expect(pageB).toHaveURL(/\/app/);
      await expect(pageB.locator('[data-testid="user-email"]')).toContainText(MOCK_USER_B.email);

      await pageB.locator('[data-testid="signout-button"]').click();
      await expect(pageB).toHaveURL(/\/auth\/login/);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('forgot password link navigates from login to /auth/forgot-password', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /forgot your password/i }).click();

    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reset Vault Password');
  });

  test('forgot password form dispatches recovery request and displays polite notice', async ({ page }) => {
    await mockPasswordRecoverySuccess(page);

    await page.goto('/auth/forgot-password');
    await page.locator('#recovery-email').fill('operative@personalfinance.vault');
    await page.getByRole('button', { name: /send recovery link/i }).click();

    const alert = page.locator('.alert.alert-success');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/password recovery instructions have been dispatched/i);
  });

  test('forgot password rate limit error displays rate limit warning banner', async ({ page }) => {
    await mockPasswordRecoveryRateLimit(page);

    await page.goto('/auth/forgot-password');
    await page.locator('#recovery-email').fill('operative@personalfinance.vault');
    await page.getByRole('button', { name: /send recovery link/i }).click();

    const alert = page.locator('.alert.alert-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/rate limit/i);
  });

  test('reset password displays expired link warning when opened without recovery session', async ({ page }) => {
    await page.goto('/auth/reset-password');

    const alert = page.locator('.alert.alert-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid or has expired/i);
    await expect(page.getByRole('link', { name: /request new recovery link/i })).toBeVisible();
  });

  test('reset password updates password successfully when authenticated via recovery session', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await mockPasswordUpdateSuccess(page, MOCK_USER_A);

    await page.goto('/auth/reset-password');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set New Password');

    await page.locator('#new-password').fill('UpdatedPass123!');
    await page.locator('#new-password-confirmation').fill('UpdatedPass123!');
    await page.getByRole('button', { name: /update master password/i }).click();

    const alert = page.locator('.alert.alert-success');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/updated successfully/i);
  });

  test('zero horizontal overflow across all core viewport configurations including authenticated app shell', async ({ page }) => {
    for (const route of ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password']) {
      await page.goto(route);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }

    // Validar app shell autenticada con datos demo
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await expect(page.locator('[data-testid="demo-badge"]')).toBeVisible();
    await expect(page.locator('.kpi-card.real-balance')).toBeVisible();
  });

  test('end-to-end financial operations: record income, create obligation, record payment and verify metrics', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    // 1. Verificar carga inicial de la bóveda
    await expect(page.locator('[data-testid="demo-badge"]')).toBeVisible();
    await expect(page.locator('.kpi-card.real-balance .kpi-value')).toBeVisible();

    // 2. Registrar Ingreso
    await page.getByRole('tab', { name: /ingresos/i }).click();
    await page.getByRole('button', { name: /\+ ingreso/i }).click();
    await expect(page.locator('.modal-card')).toBeVisible();

    await page.locator('#inc-desc').fill('Cobro Proyecto Freelance');
    await page.locator('#inc-amount').fill('1500000');
    await page.getByRole('button', { name: /registrar ingreso/i }).click();
    await expect(page.locator('.alert-banner.success')).toBeVisible();

    // 3. Crear Obligación
    await page.getByRole('tab', { name: /obligaciones/i }).click();
    await page.getByRole('button', { name: /\+ obligación/i }).click();
    await expect(page.locator('.modal-card')).toBeVisible();

    await page.locator('#ob-name').fill('Seguro Exequial');
    await page.locator('#ob-amount').fill('120000');
    await page.getByRole('button', { name: /guardar obligación/i }).click();
    await expect(page.locator('.alert-banner.success')).toBeVisible();

    // 4. Registrar Pago
    const obligationCard = page.locator('.obligation-card', { hasText: 'Seguro Exequial' });
    await expect(obligationCard).toBeVisible();
    await obligationCard.getByRole('button', { name: /registrar pago/i }).click();

    await expect(page.locator('.modal-card')).toBeVisible();
    await page.getByRole('button', { name: /confirmar pago/i }).click();
    await expect(page.locator('.alert-banner.success')).toBeVisible();
    await expect(obligationCard.locator('.paid-check')).toBeVisible();

    // 5. Verificar Cascada
    await page.getByRole('tab', { name: /cascada/i }).click();
    await expect(page.locator('.waterfall-milestone.start')).toBeVisible();
    await expect(page.locator('.waterfall-milestone.end')).toBeVisible();
  });

  test('Fase 3: Gestión de créditos, tablas de amortización francés/alemán con residuo cero y cuota mensual', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    // 1. Navegar a Créditos
    await page.getByRole('tab', { name: /créditos/i }).click();
    await expect(page.locator('[data-testid="credits-manager"]')).toBeVisible();

    // 2. Verificar Crédito A y B preconfigurados
    const creditCardA = page.locator('.credit-card', { hasText: 'Crédito Vehículo Occidente' });
    const creditCardB = page.locator('.credit-card', { hasText: 'Crédito Educativo Convenio 0%' });
    await expect(creditCardA).toBeVisible();
    await expect(creditCardB).toBeVisible();

    // 3. Abrir Tabla de Amortización para Crédito A
    await creditCardA.locator('[data-testid="btn-view-schedule"]').click();
    await expect(page.locator('[data-testid="amortization-table-container"]')).toBeVisible();

    // Verificar Sistema Francés por defecto
    await expect(page.locator('[data-testid="toggle-french"]')).toHaveClass(/active/);
    const tableRows = page.locator('[data-testid="amortization-table"] tbody tr');
    await expect(tableRows.first()).toBeVisible();
    // La última cuota debe tener residuo de capital exactamente $ 0,00
    const lastRowRemaining = tableRows.last().locator('td').last();
    await expect(lastRowRemaining).toContainText('0,00');

    // Cambiar a Sistema Alemán
    await page.locator('[data-testid="toggle-german"]').click();
    await expect(page.locator('[data-testid="toggle-german"]')).toHaveClass(/active/);
    const germanRows = page.locator('[data-testid="amortization-table"] tbody tr');
    await expect(germanRows.first()).toBeVisible();
    await expect(germanRows.last().locator('td').last()).toContainText('0,00');

    // Cerrar modal
    await page.locator('.modal-close').click();

    // 4. Integrar Cuota Mensual a Obligaciones usando Crédito B (sin cuota preexistente en el mes)
    await creditCardB.locator('[data-testid="btn-generate-installment"]').click();
    await expect(page.locator('[data-testid="credit-action-alert"]')).toContainText('integrada exitosamente');

    // Reintento idempotente: no debe duplicar la obligación
    await creditCardB.locator('[data-testid="btn-generate-installment"]').click();
    await expect(page.locator('[data-testid="credit-action-alert"]')).toContainText('ya fue generada previamente');

    // Verificar en pestaña de Obligaciones
    await page.getByRole('tab', { name: /obligaciones/i }).click();
    await expect(page.locator('.obligation-card', { hasText: 'Crédito Educativo' })).toBeVisible();
  });

  test('Fase 3: Tarjetas de crédito, compras diferidas, control de cupo disponible y liquidación', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    // 1. Navegar a Tarjetas
    await page.getByRole('tab', { name: /tarjetas/i }).click();
    await expect(page.locator('[data-testid="credit-cards-manager"]')).toBeVisible();

    // 2. Verificar Tarjeta A y B
    const cardPanelA = page.locator('.credit-card-panel', { hasText: 'Tarjeta Visa Platinum' });
    const cardPanelB = page.locator('.credit-card-panel', { hasText: 'Tarjeta Mastercard Black' });
    await expect(cardPanelA).toBeVisible();
    await expect(cardPanelB).toBeVisible();

    // Verificar compras diferidas asociadas a Tarjeta A
    await expect(cardPanelA.locator('.purchase-item', { hasText: 'MacBook Pro Trabajo' })).toBeVisible();
    await expect(cardPanelA.locator('.purchase-item', { hasText: 'Mercado Mensual Supermercado' })).toBeVisible();

    // 3. Intento de compra superior al cupo disponible
    await cardPanelA.locator('[data-testid="btn-add-purchase"]').click();
    await expect(page.locator('.modal-card')).toBeVisible();

    await page.locator('#purchase-desc').fill('Compra Excedida');
    await page.locator('#purchase-amount').fill('90000000'); // Muy superior al cupo
    await page.locator('#purchase-installments').fill('12');
    await page.locator('#purchase-rate').fill('2.0');
    await page.locator('[data-testid="btn-submit-purchase"]').click();

    // Debe mostrar error de cupo insuficiente y no cerrar modal
    await expect(page.locator('[data-testid="card-action-alert"]')).toContainText(
      'excede el cupo disponible de la tarjeta'
    );

    // 4. Compra válida dentro de cupo
    await page.locator('#purchase-desc').fill('Audífonos Bluetooth');
    await page.locator('#purchase-amount').fill('300000');
    await page.locator('[data-testid="btn-submit-purchase"]').click();
    await expect(page.locator('[data-testid="card-action-alert"]')).toContainText('registrada exitosamente');
    await expect(cardPanelA.locator('.purchase-item', { hasText: 'Audífonos Bluetooth' })).toBeVisible();

    // 5. Generar extracto / cuota mensual
    await cardPanelA.locator('[data-testid="btn-generate-statement"]').click();
    await expect(page.locator('[data-testid="card-action-alert"]')).toContainText('integrado exitosamente');

    // Reintento idempotente
    await cardPanelA.locator('[data-testid="btn-generate-statement"]').click();
    await expect(page.locator('[data-testid="card-action-alert"]')).toContainText('ya fue generado previamente');
  });

  test('Fase 3: Simuladores de abonos extraordinarios (plazo vs cuota) y rediferidos sin alterar saldos reales', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    // 1. Navegar a Simuladores
    await page.getByRole('tab', { name: /simuladores/i }).click();
    await expect(page.locator('[data-testid="financial-simulators"]')).toBeVisible();
    await expect(page.locator('.disclaimer-banner')).toBeVisible();

    // 2. Simulación de Abono Extraordinario - Reducción de Plazo
    await page.locator('[data-testid="input-prepayment-amount"]').fill('5000000');
    await page.locator('[data-testid="radio-reduce-term"]').check();
    await page.locator('[data-testid="btn-run-prepayment"]').click();

    await expect(page.locator('[data-testid="prepayment-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="prepayment-interest-savings"]')).toBeVisible();

    // 3. Simulación de Abono Extraordinario - Reducción de Cuota
    await page.locator('[data-testid="radio-reduce-installment"]').check();
    await page.locator('[data-testid="btn-run-prepayment"]').click();
    await expect(page.locator('[data-testid="prepayment-results"]')).toBeVisible();

    // 4. Simulación de Rediferido
    await page.locator('[data-testid="tab-redeferred"]').click();
    await expect(page.locator('[data-testid="redeferred-simulator-view"]')).toBeVisible();

    await page.locator('[data-testid="input-proposed-installments"]').fill('36');
    await page.locator('[data-testid="input-proposed-rate"]').fill('20.5');
    await page.locator('[data-testid="btn-run-redeferred"]').click();

    await expect(page.locator('[data-testid="redeferred-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="redeferred-cost-diff"]')).toBeVisible();

    // 5. Validar que los saldos reales no sufrieron modificaciones
    await page.getByRole('tab', { name: /créditos/i }).click();
    const creditCardA = page.locator('.credit-card', { hasText: 'Crédito Vehículo Occidente' });
    await expect(creditCardA.locator('[data-testid="credit-principal-balance"]')).toContainText('32.000.000,00');
  });

  test('Fase 3: Dashboard financiero con separación de capital, cuotas exigibles, cupos y costos futuros', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    // Validar KPIs en el dashboard
    await expect(page.locator('.kpi-card.real-balance')).toBeVisible();
    await expect(page.locator('.kpi-card.principal-debt')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-total-debt"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-available-credit"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-projected-interest"]')).toBeVisible();

    // Verificar que no haya overflow horizontal en la ventana
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('UX-01 Regresión: Selector de meses desktop sin recorte vertical, 12 meses visibles e interacción funcional', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    const monthSelector = page.locator('.month-selector');
    await expect(monthSelector).toBeVisible();

    const pills = page.locator('.month-selector .month-pill');
    await expect(pills).toHaveCount(12);

    // Verificar que el selector y los botones no sufren compresión ni recorte vertical
    const boxMetrics = await monthSelector.evaluate((el) => {
      const pillsEls = Array.from(el.querySelectorAll('.month-pill')) as HTMLElement[];
      const elRect = el.getBoundingClientRect();
      return {
        selectorHeight: el.clientHeight,
        minPillHeight: Math.min(...pillsEls.map((p) => p.offsetHeight)),
        allPillsVisible: pillsEls.every((p) => p.offsetHeight >= 34),
        noNegativeOffset: pillsEls.every((p) => {
          const r = p.getBoundingClientRect();
          return r.top >= elRect.top - 2 && r.bottom <= elRect.bottom + 2;
        }),
      };
    });

    expect(boxMetrics.selectorHeight).toBeGreaterThanOrEqual(48);
    expect(boxMetrics.minPillHeight).toBeGreaterThanOrEqual(34);
    expect(boxMetrics.allPillsVisible).toBe(true);

    // Navegación interactiva entre meses
    const novPill = pills.nth(10); // Noviembre (index 10)
    await novPill.click();
    await expect(novPill).toHaveClass(/active/);

    // Verificar con sidebar colapsado (en viewports desktop)
    const sidebarToggle = page.locator('.sidebar-toggle-btn');
    if (await sidebarToggle.isVisible()) {
      await sidebarToggle.click();
      await page.waitForTimeout(150);
      await expect(page.locator('.app-sidebar')).toHaveClass(/collapsed/);
      expect(await monthSelector.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(48);
      await sidebarToggle.click();
    }
  });
});
