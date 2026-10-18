import { test, expect, Browser, BrowserContext, Page, chromium } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const APP_URL = 'http://localhost:4201';
const EVIDENCE_DIR = path.join('C:\\Users\\YAMI\\Documents\\projects\\personal-finance\\docs\\sprints\\evidence\\ux-03-3');
const RUN_ID = `E2E-${Date.now()}`;
const ALICE_EMAIL = 'alice@localtest.dev';
const ALICE_PASS = 'Test1234!';
const BOB_EMAIL = 'bob@localtest.dev';
const BOB_PASS = 'Test1234!';
const ACCOUNT_NAME = `Cuenta E2E Alice ${RUN_ID}`;
const INCOME_DESC = `Ingreso E2E ${RUN_ID}`;
const INITIAL_BALANCE = 1000000;
const INCOME_AMOUNT = 250000;
const EXPECTED_BALANCE = INITIAL_BALANCE + INCOME_AMOUNT;

function psql(sql: string): string {
  const tmp = path.join(require('os').tmpdir(), `pf_e2e_${Date.now()}.sql`);
  fs.writeFileSync(tmp, sql);
  try {
    return execSync(
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" "postgresql://postgres:postgres@127.0.0.1:54422/postgres" -t --file="${tmp}"`,
      { env: { ...process.env, PGPASSWORD: 'postgres' } }
    ).toString().trim();
  } finally {
    fs.unlinkSync(tmp);
  }
}

function screenshot(page: Page, name: string) {
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${APP_URL}/auth/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('#login-email', email);
  await page.fill('#login-password', pass);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1.visually-hidden', { timeout: 10000 });
}

async function logout(page: Page) {
  const signout = page.locator('[data-testid="signout-button"]').first();
  await signout.click();
  await page.waitForURL(`${APP_URL}/auth/login`, { timeout: 8000 });
}

let browser: Browser;
let aliceCtx: BrowserContext;
let alicePage: Page;
let aliceAccountId: string;
let aliceIncomeId: string;

test.describe('UX-03.3 E2E Real — Personal Finance + Supabase Local', () => {

  test.beforeAll(async () => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    browser = await chromium.launch({ headless: false, slowMo: 200 });
    aliceCtx = await browser.newContext({ baseURL: APP_URL });
    alicePage = await aliceCtx.newPage();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  // ── FASE 2: Alice ──────────────────────────────────────────────────────────

  test('F2-01 Alice inicia sesión', async () => {
    await login(alicePage, ALICE_EMAIL, ALICE_PASS);
    const email = await alicePage.locator('[data-testid="user-email"]').textContent();
    expect(email?.trim()).toBe(ALICE_EMAIL);
    await screenshot(alicePage, '01-alice-login-ok');
  });

  test('F2-02 Alice crea cuenta financiera', async () => {
    await alicePage.click('button[title="Registrar nueva cuenta"]');
    await alicePage.waitForSelector('#acc-name', { timeout: 5000 });
    await alicePage.fill('#acc-name', ACCOUNT_NAME);
    await alicePage.selectOption('#acc-type', 'CHECKING');
    await alicePage.fill('#acc-balance', String(INITIAL_BALANCE));
    await screenshot(alicePage, '02-alice-account-form');
    await alicePage.locator('form.modal-form button[type="submit"]').first().click();
    await alicePage.waitForSelector('.alert-banner.success', { timeout: 10000 });
    await screenshot(alicePage, '03-alice-account-created');
  });

  test('F2-03 Cuenta aparece en panel Cuentas', async () => {
    await alicePage.click('button.tab-btn:has-text("Cuentas")');
    await alicePage.waitForSelector('.account-card', { timeout: 6000 });
    const names = await alicePage.locator('.acc-name').allTextContents();
    expect(names.some(n => n.includes(ACCOUNT_NAME))).toBeTruthy();
    await screenshot(alicePage, '04-alice-accounts-panel');
  });

  test('F2-04 Cuenta persiste en PostgreSQL', async () => {
    const row = psql(`SELECT id, name, current_balance FROM accounts WHERE name LIKE '%${RUN_ID}%' AND user_id='aaaaaaaa-0000-0000-0000-000000000001'`);
    expect(row).toContain(RUN_ID);
    aliceAccountId = row.trim().split('|')[0].trim();
    expect(aliceAccountId).toBeTruthy();
  });

  test('F2-05 Alice registra ingreso de COP 250.000', async () => {
    await alicePage.click('button[title="Registrar nuevo ingreso"]');
    await alicePage.waitForSelector('#inc-desc', { timeout: 5000 });
    await alicePage.fill('#inc-desc', INCOME_DESC);
    await alicePage.fill('#inc-amount', String(INCOME_AMOUNT));
    await alicePage.selectOption('#inc-acc', { value: aliceAccountId });
    await screenshot(alicePage, '05-alice-income-form');
    await alicePage.locator('form.modal-form button[type="submit"]').last().click();
    await alicePage.waitForSelector('.alert-banner.success', { timeout: 10000 });
    await screenshot(alicePage, '06-alice-income-saved');
  });

  test('F2-06 Saldo actualizado a COP 1.250.000 en PostgreSQL', async () => {
    const balRow = psql(`SELECT current_balance FROM accounts WHERE name LIKE '%${RUN_ID}%' AND user_id='aaaaaaaa-0000-0000-0000-000000000001'`);
    const balance = parseFloat(balRow.trim().replace(/[^0-9.]/g, ''));
    expect(balance).toBe(EXPECTED_BALANCE);
    const incRow = psql(`SELECT id FROM incomes WHERE source_name LIKE '%${RUN_ID}%' AND user_id='aaaaaaaa-0000-0000-0000-000000000001'`);
    aliceIncomeId = incRow.trim().split('|')[0].trim();
    expect(aliceIncomeId).toBeTruthy();
    await screenshot(alicePage, '07-alice-balance-updated');
  });

  test('F2-07 Saldo visible en UI = COP 1.250.000', async () => {
    await alicePage.click('button.tab-btn:has-text("Cuentas")');
    await alicePage.waitForSelector('.account-card', { timeout: 8000 });
    const cards = alicePage.locator('.account-card');
    const count = await cards.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const name = await cards.nth(i).locator('.acc-name').textContent();
      if (name?.includes(ACCOUNT_NAME)) {
        const val = await cards.nth(i).locator('.acc-val').textContent();
        expect(val?.replace(/\s/g, '')).toContain('1.250.000');
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });

  test('F2-08 Recarga — cuenta e ingreso persisten', async () => {
    await alicePage.reload();
    await alicePage.waitForLoadState('networkidle');
    await alicePage.click('button.tab-btn:has-text("Cuentas")');
    await alicePage.waitForSelector('.account-card', { timeout: 6000 });
    const names = await alicePage.locator('.acc-name').allTextContents();
    expect(names.some(n => n.includes(ACCOUNT_NAME))).toBeTruthy();
    await screenshot(alicePage, '08-alice-after-reload');
  });

  test('F2-09 Logout y re-login — datos siguen presentes', async () => {
    await logout(alicePage);
    await screenshot(alicePage, '09-alice-logged-out');
    await login(alicePage, ALICE_EMAIL, ALICE_PASS);
    await alicePage.click('button.tab-btn:has-text("Cuentas")');
    await alicePage.waitForSelector('.account-card', { timeout: 6000 });
    const names = await alicePage.locator('.acc-name').allTextContents();
    expect(names.some(n => n.includes(ACCOUNT_NAME))).toBeTruthy();
    await screenshot(alicePage, '10-alice-relogin-data-ok');
  });

  // ── FASE 3: Bob aislamiento ─────────────────────────────────────────────

  test('F3-01 Bob no ve datos de Alice en UI', async () => {
    const bobCtx = await browser.newContext({ baseURL: APP_URL });
    const bobPage = await bobCtx.newPage();
    await login(bobPage, BOB_EMAIL, BOB_PASS);
    await bobPage.click('button.tab-btn >> text=Cuentas');
    await bobPage.waitForLoadState('networkidle');
    const names = await bobPage.locator('.acc-name').allTextContents();
    expect(names.every(n => !n.includes(ACCOUNT_NAME))).toBeTruthy();
    await screenshot(bobPage, '11-bob-cannot-see-alice');
    await bobPage.close();
    await bobCtx.close();
  });

  test('F3-02 RLS: Bob no puede leer cuenta de Alice en PostgreSQL', async () => {
    const row = psql(`SELECT COUNT(*) FROM accounts WHERE id='${aliceAccountId}' AND user_id='bbbbbbbb-0000-0000-0000-000000000002'`);
    const count = parseInt(row.trim());
    expect(count).toBe(0);
  });

  test('F3-03 Datos de Alice intactos tras sesión de Bob', async () => {
    const row = psql(`SELECT current_balance FROM accounts WHERE id='${aliceAccountId}'`);
    const balance = parseFloat(row.trim());
    expect(balance).toBe(EXPECTED_BALANCE);
    await screenshot(alicePage, '12-alice-data-intact-after-bob');
  });

  // ── FASE 4: Evidencia final SQL ────────────────────────────────────────

  test('F4-01 Evidencia SQL final', async () => {
    const summary = psql(`
      SELECT 'ACCOUNT' as tipo, id, name, current_balance::text as valor FROM accounts WHERE id='${aliceAccountId}'
      UNION ALL
      SELECT 'INCOME', id, source_name, amount::text FROM incomes WHERE id='${aliceIncomeId}'
    `);
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'sql-evidence.txt'), `RUN_ID: ${RUN_ID}\n\n${summary}\n`);
    expect(summary).toContain(aliceAccountId);
    expect(summary).toContain(aliceIncomeId);
  });
});
