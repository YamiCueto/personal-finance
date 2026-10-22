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
  await page.screenshot({ path: testInfo.outputPath('login-light.png'), fullPage: true });
  await injectAuthenticatedSession(page, MOCK_USER_A);
  await page.goto('/app');
  await expect(page.locator('.upcoming-row').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu dinero, en perspectiva.');
  await page.screenshot({ path: testInfo.outputPath('dashboard-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Activar tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Activar tema claro' }).click();
  await page.locator('.upcoming-row').first().click();
  await expect(page.locator('.modal-card')).toBeVisible();
  await expect(page.locator('#pay-amount')).toHaveValue(/\d+/);
  await page.screenshot({ path: testInfo.outputPath('payment.png'), fullPage: true });
  await page.locator('.modal-close').click();

  for (const module of ['credits', 'cards', 'simulators', 'incomes', 'accounts', 'obligations'] as const) {
    await openModule(page, module);
    await expect(page.locator('#main-content')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${module}.png`), fullPage: true });
    // Check component bounds, not only the document (which can hide overflow).
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
