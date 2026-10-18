import { test, expect } from '@playwright/test';
import {
  MOCK_USER_A,
  setupSupabaseMocks,
  mockLoginSuccess,
  injectAuthenticatedSession,
} from './helpers/auth-mocks';

test.describe('WebKit — Escenarios críticos PWA iOS', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  test('login: sin desbordamiento horizontal y controles accesibles', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    const emailBox = await emailInput.boundingBox();
    const passBox = await passwordInput.boundingBox();
    expect(emailBox!.height).toBeGreaterThanOrEqual(44);
    expect(passBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('signup: sin desbordamiento horizontal y validación visible', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.locator('#email')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await page.locator('#email').fill('bad@');
    await page.locator('#email').press('Tab');
    await page.locator('#password').fill('123');
    await page.locator('#password').press('Tab');
    await page.locator('#passwordConfirmation').fill('456');
    await page.locator('#passwordConfirmation').press('Tab');

    const errors = page.locator('.field-error');
    await expect(errors.first()).toBeVisible();
  });

  test('app shell: sin desbordamiento horizontal en todos los paneles', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    await expect(page.locator('[data-testid="demo-badge"]')).toBeVisible();

    const tabSelectors = [
      page.getByRole('tab', { name: /Cascada/ }),
      page.locator('[data-testid="tab-credits"]'),
      page.locator('[data-testid="tab-cards"]'),
      page.locator('[data-testid="tab-simulators"]'),
    ];

    for (const tab of tabSelectors) {
      await tab.click();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }
  });

  test('navegación inferior: visible en mobile y objetivos táctiles correctos', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 768, 'mobile-bottom-nav oculta en tablet/desktop');
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    const bottomNav = page.locator('.mobile-bottom-nav');
    await expect(bottomNav).toBeVisible();

    const navItems = bottomNav.locator('.bn-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i++) {
      const box = await navItems.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('login exitoso navega a app shell en motor WebKit', async ({ page }) => {
    await mockLoginSuccess(page, MOCK_USER_A);
    await page.goto('/auth/login');

    await page.locator('#login-email').fill(MOCK_USER_A.email);
    await page.locator('#login-password').fill('password123');
    await page.getByRole('button', { name: /ingresar|sign in/i }).click();

    await expect(page).toHaveURL(/\/app/, { timeout: 8000 });
    await expect(page.locator('h1.visually-hidden')).toHaveText('Authenticated Session Verified');
  });

  test('forgot-password: sin desbordamiento y formulario funcional', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.locator('#recovery-email')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('apertura de modal de obligación: sin overflow y cierre funcional', async ({ page }) => {
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    await page.locator('.btn-quick-action', { hasText: /Obligación/ }).click();
    const modal = page.locator('.modal-card[role="dialog"][aria-labelledby="modal-ob-title"]');
    await expect(modal).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await modal.locator('.modal-close').click();
    await expect(modal).not.toBeVisible();
  });

  test('safe area: app-main-wrapper tiene padding-bottom suficiente en mobile', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 768, 'padding-bottom reducido a 2rem en tablet/desktop');
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');

    const paddingBottom = await page.locator('.app-main-wrapper').evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).paddingBottom);
    });
    expect(paddingBottom).toBeGreaterThanOrEqual(72);
  });
});
