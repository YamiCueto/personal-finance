import { test, expect } from '@playwright/test';
import * as path from 'path';
import {
  MOCK_USER_A,
  setupSupabaseMocks,
  injectAuthenticatedSession,
} from './helpers/auth-mocks';

test.describe('Visual Audit & Evidence Capture', () => {
  test('capture prototype screens', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const protoPath = 'file:///' + path.resolve('docs/design/Personal Finance.html').replace(/\\/g, '/');
    await page.goto(protoPath);

    // Ensure directory exists
    const outDir = 'docs/sprints/evidence';

    // 1. Login
    await page.click('button[data-target="s-login"]');
    await page.waitForTimeout(300);
    const device = page.locator('.device');
    await device.screenshot({ path: `${outDir}/proto-login.png` });

    // 2. Dashboard
    await page.click('button[data-target="s-dash"]');
    await page.waitForTimeout(300);
    await device.screenshot({ path: `${outDir}/proto-dashboard.png` });

    // 3. Créditos
    await page.click('button[data-target="s-creditos"]');
    await page.waitForTimeout(300);
    await device.screenshot({ path: `${outDir}/proto-creditos.png` });

    // 4. Detalle
    await page.click('button[data-target="s-detalle"]');
    await page.waitForTimeout(300);
    await device.screenshot({ path: `${outDir}/proto-detalle.png` });

    // 5. Tarjetas
    await page.click('button[data-target="s-tarjetas"]');
    await page.waitForTimeout(300);
    await device.screenshot({ path: `${outDir}/proto-tarjetas.png` });

    // 6. Simulador
    await page.click('button[data-target="s-sim"]');
    await page.waitForTimeout(300);
    await device.screenshot({ path: `${outDir}/proto-simulador.png` });

    await context.close();
  });

  test('capture angular mobile screens (390x844)', async ({ page }) => {
    await setupSupabaseMocks(page);
    const outDir = 'docs/sprints/evidence';

    // Login
    await page.goto('/auth/login');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-before-login-390.png`, fullPage: false });

    // Authenticated App
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');
    await page.waitForTimeout(500);

    // Dashboard / Cascada (activeTab = waterfall)
    await page.screenshot({ path: `${outDir}/angular-before-dashboard-390.png`, fullPage: false });

    // Créditos
    await page.locator('button.bn-item:has-text("Créditos")').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-before-creditos-390.png`, fullPage: false });

    // Amortización modal
    const firstCredit = page.locator('.credit-card').first();
    if (await firstCredit.isVisible()) {
      await firstCredit.locator('[data-testid="btn-view-schedule"]').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}/angular-before-amortizacion-390.png`, fullPage: false });
      await page.locator('.modal-close').click();
      await page.waitForTimeout(200);
    }

    // Tarjetas
    await page.locator('button.bn-item:has-text("Tarjetas")').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-before-tarjetas-390.png`, fullPage: false });

    // Simuladores
    await page.locator('button.bn-item:has-text("Simular")').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-before-simuladores-390.png`, fullPage: false });
  });

  test('capture angular after mobile screens (390x844)', async ({ browser }) => {
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await mobileCtx.newPage();
    await setupSupabaseMocks(page);
    const outDir = 'docs/sprints/evidence';

    // Authenticated App
    await injectAuthenticatedSession(page, MOCK_USER_A);
    await page.goto('/app');
    await page.waitForTimeout(500);

    // Dashboard / Cascada (activeTab = waterfall)
    await page.screenshot({ path: `${outDir}/angular-after-dashboard-390.png`, fullPage: false });

    // Créditos
    await page.locator('button.bn-item:has-text("Créditos")').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-after-creditos-390.png`, fullPage: false });

    // Amortización modal
    const firstCredit = page.locator('.credit-card').first();
    if (await firstCredit.isVisible()) {
      await firstCredit.locator('[data-testid="btn-view-schedule"]').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}/angular-after-amortizacion-390.png`, fullPage: false });
      await page.locator('.modal-close').click();
      await page.waitForTimeout(200);
    }

    // Tarjetas
    await page.locator('button.bn-item:has-text("Tarjetas")').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-after-tarjetas-390.png`, fullPage: false });

    // Simuladores
    await page.locator('button.bn-item:has-text("Simular")').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/angular-after-simuladores-390.png`, fullPage: false });

    await mobileCtx.close();
  });

  test('capture angular after desktop and tablet screens', async ({ browser }) => {
    const outDir = 'docs/sprints/evidence';

    // Tablet 768x1024
    const tabletCtx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const tabletPage = await tabletCtx.newPage();
    await setupSupabaseMocks(tabletPage);
    await injectAuthenticatedSession(tabletPage, MOCK_USER_A);
    await tabletPage.goto('/app');
    await tabletPage.waitForTimeout(500);
    await tabletPage.screenshot({ path: `${outDir}/angular-after-tablet-768.png`, fullPage: false });
    await tabletCtx.close();

    // Desktop 1440x900
    const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const deskPage = await deskCtx.newPage();
    await setupSupabaseMocks(deskPage);
    await injectAuthenticatedSession(deskPage, MOCK_USER_A);
    await deskPage.goto('/app');
    await deskPage.waitForTimeout(500);

    // 1. Month selector element screenshot after fix
    const monthSelector = deskPage.locator('.month-selector');
    await monthSelector.screenshot({ path: `${outDir}/month-selector-after-fix-1440.png` });

    // 2. Full desktop view (expanded sidebar, top position)
    await deskPage.screenshot({ path: `${outDir}/angular-after-desktop-1440.png`, fullPage: false });

    // 3. Desktop scrolled: scroll inside app-main-wrapper while sidebar stays pinned
    await deskPage.locator('.app-main-wrapper').evaluate((el) => el.scrollTo(0, 500));
    await deskPage.waitForTimeout(300);
    await deskPage.screenshot({ path: `${outDir}/angular-after-desktop-scrolled-1440.png`, fullPage: false });

    // 4. Desktop sidebar collapsed (scroll back to top, then collapse)
    await deskPage.locator('.app-main-wrapper').evaluate((el) => el.scrollTo(0, 0));
    await deskPage.waitForTimeout(200);
    await deskPage.locator('.sidebar-toggle-btn').click();
    await deskPage.waitForTimeout(300);
    await deskPage.screenshot({ path: `${outDir}/angular-after-desktop-collapsed-1440.png`, fullPage: false });

    const metrics = await deskPage.evaluate(() => {
      const s = document.querySelector('.month-selector');
      const track = document.querySelector('.month-carousel-track');
      const firstPill = document.querySelector('.month-pill');
      const activePill = document.querySelector('.month-pill.active');
      const parent = s ? s.parentElement : null;
      return {
        selectorClientH: s ? s.clientHeight : null,
        selectorOffsetH: s ? s.offsetHeight : null,
        selectorScrollH: s ? s.scrollHeight : null,
        selectorComputed: s ? {
          display: getComputedStyle(s).display,
          height: getComputedStyle(s).height,
          flexShrink: getComputedStyle(s).flexShrink,
          flexGrow: getComputedStyle(s).flexGrow,
          flexBasis: getComputedStyle(s).flexBasis,
          padding: getComputedStyle(s).padding,
          overflowX: getComputedStyle(s).overflowX,
          overflowY: getComputedStyle(s).overflowY,
        } : null,
        pillOffsetH: firstPill ? firstPill.offsetHeight : null,
        activePillOffsetH: activePill ? activePill.offsetHeight : null,
      };
    });
    console.log('--- FIXED MONTH SELECTOR METRICS ---', JSON.stringify(metrics, null, 2));

    await deskCtx.close();
  });
});
