import { test, expect } from '@playwright/test';

test.describe('Authentication Foundation & Route Protection', () => {
  // Scenario 1: Routing - Unauthenticated access and guest access
  test('unauthenticated request to /app redirects to /auth/login, while guest routes are accessible', async ({
    page,
  }) => {
    // Unauthenticated request to protected route
    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Acceso a la Bóveda|Access Vault/i);

    // Guest can access login
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Acceso a la Bóveda|Access Vault/i);

    // Guest can access signup
    await page.goto('/auth/signup');
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Crear Cuenta en la Bóveda|Create Vault Account/i);
  });

  // Scenario 2: Login page renders and is usable at mobile viewport
  test('login page renders accessible controls and enforces minimum touch targets', async ({ page }) => {
    await page.goto('/auth/login');

    // Heading and identity branding
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Acceso a la Bóveda|Access Vault/i);
    await expect(page.getByText(/Control Financiero Personal|Financial Control System/i)).toBeVisible();

    // Form inputs and controls
    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const submitButton = page.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i });
    const toggleButton = page.getByRole('button', { name: /ver contraseña|mostrar contraseña|show password/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(toggleButton).toBeVisible();
    await expect(submitButton).toBeDisabled();

    // Verify touch target size meets minimum 44px
    const submitBox = await submitButton.boundingBox();
    expect(submitBox).not.toBeNull();
    expect(submitBox!.height).toBeGreaterThanOrEqual(44);

    // Verify password visibility toggle
    await passwordInput.fill('SecretValue123');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: /ocultar contraseña|hide password/i })).toBeVisible();

    // Verify no horizontal overflow
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  // Scenario 3: Signup page renders and validates invalid input
  test('signup page validates invalid email, minimum length, and weak password requirements', async ({
    page,
  }) => {
    await page.goto('/auth/signup');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Crear Cuenta en la Bóveda|Create Vault Account/i);

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const submitButton = page.getByRole('button', { name: /crear cuenta en la bóveda|create account/i });

    // Invalid email triggers format error
    await emailInput.fill('invalid-email-format');
    await emailInput.blur();
    await expect(page.locator('#email-error')).toContainText(/Ingresa un formato de correo electrónico válido|Please enter a valid email format/i);

    // Short password triggers length error
    await passwordInput.fill('short');
    await passwordInput.blur();
    await expect(page.locator('#password-error')).toContainText(/La contraseña debe tener al menos 8 caracteres|Password must be at least 8 characters long/i);

    // Weak password without numbers triggers strength error
    await passwordInput.fill('lettersonlyhere');
    await passwordInput.blur();
    await expect(page.locator('#password-error')).toContainText(
      /La contraseña debe incluir al menos una letra y un número|Password must include at least one letter and one number/i
    );

    await expect(submitButton).toBeDisabled();
  });

  // Scenario 4: Password mismatch validation
  test('signup page displays mismatch error when passwords do not match', async ({ page }) => {
    await page.goto('/auth/signup');

    await page.locator('#email').fill('operative@example.com');
    await page.locator('#password').fill('StrongPass123!');
    await page.locator('#passwordConfirmation').fill('DifferentPass456!');
    await page.locator('#passwordConfirmation').blur();

    await expect(page.locator('#confirmation-error')).toContainText(/Las contraseñas no coinciden|Passwords do not match/i);
    await expect(page.getByRole('button', { name: /crear cuenta en la bóveda|create account/i })).toBeDisabled();
  });

  // Scenario 5: Navigation between login and signup
  test('user can navigate smoothly between login and signup pages', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);

    // Click link to signup
    await page.getByRole('link', { name: /crear cuenta en la bóveda|create vault account/i }).click();
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Crear Cuenta en la Bóveda|Create Vault Account/i);

    // Click link back to login
    await page.getByRole('link', { name: /iniciar sesión|ingresar|sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Acceso a la Bóveda|Access Vault/i);
  });

  // Scenario 6: Invalid login produces a controlled error state
  test('invalid login produces a normalized error banner without crashing', async ({ page }) => {
    await page.goto('/auth/login');

    await page.locator('#login-email').fill('nonexistent-vault-user@test.invalid');
    await page.locator('#login-password').fill('WrongPassword999!');

    const submitButton = page.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Verify error banner appears with role="alert"
    const alert = page.locator('.alert.alert-error');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).toContainText(/Correo o contraseña incorrectos|Invalid email or password|Authentication Failed/i);

    // Verify form remains accessible and interactive
    await expect(page.locator('#login-email')).toBeEnabled();
    await expect(page.locator('#login-password')).toBeEnabled();
  });

  // Scenario 7a: Live authenticated flow for User A (Resource Owner) + guestGuard
  test('User A independent authentication, guestGuard protection, and session lifecycle', async ({
    page,
  }) => {
    const userAEmail = process.env['E2E_TEST_USER_A_EMAIL'];
    const userAPassword = process.env['E2E_TEST_USER_A_PASSWORD'];

    test.skip(
      !userAEmail || !userAPassword,
      'Skipped: E2E_TEST_USER_A_EMAIL and E2E_TEST_USER_A_PASSWORD must be configured in local .env'
    );

    await page.goto('/auth/login');
    await page.locator('#login-email').fill(userAEmail!);
    await page.locator('#login-password').fill(userAPassword!);
    await page.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i }).click();

    // Verify redirection to /app shell with User A identity
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authenticated Session Verified');
    await expect(page.locator('[data-testid="user-email"]')).toContainText(userAEmail!);

    // Verify guestGuard: authenticated user navigating to /auth/login is redirected to /app
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/app/);

    // Verify guestGuard: authenticated user navigating to /auth/signup is redirected to /app
    await page.goto('/auth/signup');
    await expect(page).toHaveURL(/\/app/);

    // Sign out
    await page.locator('[data-testid="signout-button"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);

    // Verify /app is protected again
    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  // Scenario 7b: Live authenticated flow for User B (Cross-User Attacker / Tenant B)
  test('User B independent authentication & session lifecycle', async ({ page }) => {
    const userBEmail = process.env['E2E_TEST_USER_B_EMAIL'];
    const userBPassword = process.env['E2E_TEST_USER_B_PASSWORD'];

    test.skip(
      !userBEmail || !userBPassword,
      'Skipped: E2E_TEST_USER_B_EMAIL and E2E_TEST_USER_B_PASSWORD must be configured in local .env'
    );

    await page.goto('/auth/login');
    await page.locator('#login-email').fill(userBEmail!);
    await page.locator('#login-password').fill(userBPassword!);
    await page.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i }).click();

    // Verify redirection to /app shell with User B identity
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authenticated Session Verified');
    await expect(page.locator('[data-testid="user-email"]')).toContainText(userBEmail!);

    // Sign out
    await page.locator('[data-testid="signout-button"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);

    // Verify /app is protected again
    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  // Scenario 7c: Multi-tenant session isolation (Simultaneous User A and User B) + Logout Independence
  test('User A and User B maintain isolated concurrent sessions and logout of A does not affect B', async ({
    browser,
  }) => {
    const userAEmail = process.env['E2E_TEST_USER_A_EMAIL'];
    const userAPassword = process.env['E2E_TEST_USER_A_PASSWORD'];
    const userBEmail = process.env['E2E_TEST_USER_B_EMAIL'];
    const userBPassword = process.env['E2E_TEST_USER_B_PASSWORD'];

    test.skip(
      !userAEmail || !userAPassword || !userBEmail || !userBPassword,
      'Skipped: Both User A and User B credentials must be configured in local .env'
    );

    // Create independent browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Authenticate User A in Context A
      await pageA.goto('/auth/login');
      await pageA.locator('#login-email').fill(userAEmail!);
      await pageA.locator('#login-password').fill(userAPassword!);
      await pageA.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i }).click();
      await expect(pageA).toHaveURL(/\/app/);
      await expect(pageA.locator('[data-testid="user-email"]')).toContainText(userAEmail!);

      // Authenticate User B in Context B
      await pageB.goto('/auth/login');
      await pageB.locator('#login-email').fill(userBEmail!);
      await pageB.locator('#login-password').fill(userBPassword!);
      await pageB.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i }).click();
      await expect(pageB).toHaveURL(/\/app/);
      await expect(pageB.locator('[data-testid="user-email"]')).toContainText(userBEmail!);

      // Verify no session/token cross-contamination
      const contextAUser = await pageA.locator('[data-testid="user-email"]').innerText();
      const contextBUser = await pageB.locator('[data-testid="user-email"]').innerText();
      expect(contextAUser).toBe(userAEmail);
      expect(contextBUser).toBe(userBEmail);
      expect(contextAUser).not.toBe(contextBUser);

      // Verify logging out A does NOT log out B
      await pageA.locator('[data-testid="signout-button"]').click();
      await expect(pageA).toHaveURL(/\/auth\/login/);

      // Verify Context B is still fully authenticated
      await pageB.reload();
      await expect(pageB).toHaveURL(/\/app/);
      await expect(pageB.locator('[data-testid="user-email"]')).toContainText(userBEmail!);

      // Finally sign out Context B cleanly
      await pageB.locator('[data-testid="signout-button"]').click();
      await expect(pageB).toHaveURL(/\/auth\/login/);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  // Scenario 7d: ReturnUrl preservation without redirect loops
  test('returnUrl parameter preserves deep link without redirect loops', async ({ page }) => {
    const userAEmail = process.env['E2E_TEST_USER_A_EMAIL'];
    const userAPassword = process.env['E2E_TEST_USER_A_PASSWORD'];

    test.skip(
      !userAEmail || !userAPassword,
      'Skipped: E2E_TEST_USER_A_EMAIL and E2E_TEST_USER_A_PASSWORD must be configured in local .env'
    );

    // Unauthenticated access to target deep URL
    await page.goto('/app?view=vault-summary');
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fapp%3Fview%3Dvault-summary/);

    // Log in
    await page.locator('#login-email').fill(userAEmail!);
    await page.locator('#login-password').fill(userAPassword!);
    await page.getByRole('button', { name: /ingresar a la bóveda|sign in to vault/i }).click();

    // Verify redirected directly to original deep URL without redirect loops
    await expect(page).toHaveURL('/app?view=vault-summary');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authenticated Session Verified');

    // Clean up session
    await page.locator('[data-testid="signout-button"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  // Scenario 8: Zero horizontal overflow validation
  test('zero horizontal overflow across viewports', async ({ page }) => {
    for (const route of ['/auth/login', '/auth/signup']) {
      await page.goto(route);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }
  });
});
