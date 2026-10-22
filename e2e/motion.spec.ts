import { test, expect } from '@playwright/test';
import { MOCK_USER_A, setupSupabaseMocks, injectAuthenticatedSession } from './helpers/auth-mocks';

test.use({ video: 'on' });

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`motion: exact amounts, overlays, themes and responsive navigation (${reducedMotion})`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion, colorScheme: 'light' });
    await setupSupabaseMocks(page);
    await page.goto('/auth/login');
    await expect(page.locator('.wordmark')).toBeVisible();
    await expect(page.locator('.wordmark .brand-mark')).toHaveCSS('animation-name', reducedMotion === 'reduce' ? 'none' : 'braviso-mark');
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');
    await expect(page.locator('.upcoming-row').first()).toBeVisible();
    const amounts = page.locator('.kpi-value');
    for (const amount of await amounts.all()) {
      await expect.poll(async () => (await amount.locator('[aria-hidden]').innerText()).trim()).toBe(await amount.getAttribute('data-amount'));
    }
    await expect.poll(() => page.locator('.kpi-card').first().evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
    await page.getByRole('button', { name: 'Activar tema oscuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).not.toHaveClass(/theme-motion/);
    await page.screenshot({ path: testInfo.outputPath('motion-dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Activar tema claro' }).click();
    await expect(page.locator('html')).not.toHaveClass(/theme-motion/);
    await page.locator('.upcoming-row').first().click();
    await expect(page.locator('.modal-card')).toBeVisible();
    await page.locator('.modal-close').click();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('.alert-banner.success')).toHaveCount(0);
    await page.locator('.upcoming-row').first().click();
    await page.locator('#pay-mode').selectOption('PARTIAL');
    await page.locator('#pay-amount').fill('1000');
    await page.getByRole('button', { name: 'Confirmar Pago' }).click();
    await expect(page.locator('.alert-banner.success')).toBeVisible();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    expect(await page.locator('.kpi-card').first().evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
    const collapse = page.getByRole('button', { name: 'Colapsar barra lateral' });
    if (await collapse.isVisible()) {
      await collapse.click();
      await page.getByRole('button', { name: 'Expandir barra lateral' }).click();
    } else {
      await page.locator('.bn-item').last().click();
      await expect(page.locator('.mobile-more-sheet')).toBeVisible();
      await page.locator('.sheet-close').click();
      await expect(page.locator('.mobile-more-backdrop')).toHaveCount(0);
    }
    await page.locator('.month-pill').first().click();
    await expect(page.locator('.month-pill').first()).toHaveAttribute('aria-pressed', 'true');
    for (const amount of await amounts.all()) {
      await expect.poll(async () => (await amount.locator('[aria-hidden]').innerText()).trim()).toBe(await amount.getAttribute('data-amount'));
    }
    await expect.poll(() => page.locator('.progress-ring').evaluate(el => {
      const actual = Number((el.getAttribute('aria-label') || '').match(/\d+/)?.[0]);
      return Math.round(parseFloat((el as HTMLElement).style.getPropertyValue('--progress'))) === actual;
    })).toBe(true);
    await expect(page.locator('.kpi-card').first()).toHaveCSS('animation-name', reducedMotion === 'reduce' ? 'none' : 'braviso-reveal');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('motion-light.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}
