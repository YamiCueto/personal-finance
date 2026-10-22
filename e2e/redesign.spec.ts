import { test, expect } from '@playwright/test';
import { MOCK_USER_A, setupSupabaseMocks, injectAuthenticatedSession } from './helpers/auth-mocks';
import { openModule } from './helpers/navigation';

test('redesign: navigation, themes, payment entry and responsive content', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await setupSupabaseMocks(page);
  await page.goto('/auth/login');
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page).toHaveTitle('BRAVISO — Tu dinero, en perspectiva.');
  await expect(page.locator('.wordmark svg')).toHaveAttribute('aria-label', 'BRAVISO');
  await page.screenshot({ path: testInfo.outputPath('login-light.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('.wordmark svg')).toHaveCSS('color', 'rgb(212, 229, 170)');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: testInfo.outputPath('login-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await injectAuthenticatedSession(page, MOCK_USER_A);
  await page.goto('/app');
  await expect(page.locator('.upcoming-row').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu dinero, en perspectiva.');
  await page.screenshot({ path: testInfo.outputPath('dashboard-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Activar tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.theme-toggle')).toHaveCSS('color', 'rgb(187, 201, 188)');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Activar tema claro' }).click();
  const sidebarToggle = page.getByRole('button', { name: 'Colapsar barra lateral' });
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
    await expect(page.locator('.sidebar-brand svg')).toHaveAttribute('viewBox', '0 0 64 64');
    await page.screenshot({ path: testInfo.outputPath('sidebar-compact.png'), fullPage: true });
    await page.getByRole('button', { name: 'Expandir barra lateral' }).click();
  } else {
    await expect(page.locator('.mobile-bottom-nav app-brand-logo svg')).toHaveAttribute('viewBox', '0 0 64 64');
  }
  await page.locator('.upcoming-row').first().click();
  await expect(page.locator('.modal-card')).toBeVisible();
  await expect(page.locator('#pay-amount')).toHaveValue(/\d+/);
  await page.screenshot({ path: testInfo.outputPath('payment.png'), fullPage: true });
  await page.locator('.modal-close').click();

  for (const module of ['credits', 'cards', 'simulators', 'incomes', 'accounts', 'obligations'] as const) {
    await openModule(page, module);
    await expect(page.locator('#main-content')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${module}.png`), fullPage: true });
    const overflow = await page.locator('#main-content').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('input, select, .credit-card, .credit-card-panel, .account-card, .obligation-card, .simulator-card')]
        .filter(node => node.getBoundingClientRect().width > 0)
        .filter(node => node.getBoundingClientRect().right > rect.right + 1 || node.getBoundingClientRect().left < rect.left - 1)
        .map(node => node.className);
    });
    expect(overflow).toEqual([]);
  }
  expect(errors).toEqual([]);
});
