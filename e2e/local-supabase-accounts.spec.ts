import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const APP_URL = 'http://localhost:4201';
const ALICE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ALICE_EMAIL = 'alice@localtest.dev';
const ALICE_PASS = 'Test1234!';

function runPsql(sql: string): string {
  return execSync(
    `docker exec -i supabase_db_personal-finance psql -U postgres -d postgres -t -A`,
    { input: sql, encoding: 'utf8' }
  ).trim();
}

test('E2E Real Angular -> Supabase Local (GoTrue + PostgREST + PostgreSQL 17): eliminar, archivar, historial y restaurar cuenta', async ({ page }) => {
  const runId = `E2E-REAL-${Date.now()}`;
  const ephemeralAccName = `Cuenta Efímera ${runId}`;
  const protectedAccName = `Cuenta Protegida ${runId}`;

  await page.goto(`${APP_URL}/auth/login`);
  await page.fill('#login-email', ALICE_EMAIL);
  await page.fill('#login-password', ALICE_PASS);
  await page.click('button[type="submit"]');
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="user-email"]')).toContainText(ALICE_EMAIL);

  await page.getByRole('button', { name: /Cuentas/ }).first().click();

  await page.getByRole('button', { name: '+ Cuenta', exact: true }).click();
  await page.locator('#acc-name').fill(ephemeralAccName);
  await page.locator('#acc-balance').fill('150000');
  await page.getByRole('button', { name: 'Guardar Cuenta', exact: true }).click();

  const ephemeralCard = page.locator('.account-card').filter({ hasText: ephemeralAccName });
  await expect(ephemeralCard).toBeVisible();

  const ephemeralDbId = runPsql(
    `SELECT id FROM public.accounts WHERE user_id = '${ALICE_ID}' AND name = '${ephemeralAccName}';`
  );
  expect(ephemeralDbId).toMatch(/^[0-9a-f-]{36}$/);

  await ephemeralCard.getByRole('button', { name: `Eliminar cuenta ${ephemeralAccName}`, exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: '¿Eliminar esta cuenta?', exact: true });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByLabel(/Motivo de eliminación/).fill(`Borrado E2E real ${runId}`);
  await deleteDialog.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  await expect(ephemeralCard).toHaveCount(0);

  const countInAccounts = runPsql(
    `SELECT count(*) FROM public.accounts WHERE id = '${ephemeralDbId}';`
  );
  expect(Number(countInAccounts)).toBe(0);

  const auditRow = runPsql(
    `SELECT account_name || '|' || owner_user_id || '|' || deleted_by || '|' || deletion_reason || '|' || (metadata->>'rpc') FROM public.financial_account_deletion_audit WHERE account_id = '${ephemeralDbId}';`
  );
  expect(auditRow).toBe(`${ephemeralAccName}|${ALICE_ID}|${ALICE_ID}|Borrado E2E real ${runId}|delete_financial_account`);

  await page.getByRole('button', { name: '+ Cuenta', exact: true }).click();
  await page.locator('#acc-name').fill(protectedAccName);
  await page.locator('#acc-balance').fill('500000');
  await page.getByRole('button', { name: 'Guardar Cuenta', exact: true }).click();

  const protectedCard = page.locator('.account-card').filter({ hasText: protectedAccName });
  await expect(protectedCard).toBeVisible();

  const protectedDbId = runPsql(
    `SELECT id FROM public.accounts WHERE user_id = '${ALICE_ID}' AND name = '${protectedAccName}';`
  );
  expect(protectedDbId).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: /Ingresos/ }).first().click();
  await page.getByRole('button', { name: /Ingreso/ }).filter({ hasText: '+' }).first().click();
  await page.locator('#inc-acc').selectOption(protectedDbId);
  await page.locator('#inc-amount').fill('100000');
  await page.locator('#inc-desc').fill(`Ingreso Real ${runId}`);
  await page.getByRole('button', { name: 'Registrar Ingreso', exact: true }).click();

  await page.getByRole('button', { name: /Cuentas/ }).first().click();
  await protectedCard.getByRole('button', { name: `Eliminar cuenta ${protectedAccName}`, exact: true }).click();
  await expect(deleteDialog.getByRole('button', { name: 'Archivar cuenta' })).toHaveCount(0);
  await deleteDialog.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  await expect(deleteDialog.getByRole('alert')).toContainText('historial financiero');
  await expect(deleteDialog.getByRole('button', { name: 'Archivar cuenta', exact: true })).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await protectedCard.getByRole('button', { name: `Archivar cuenta ${protectedAccName}`, exact: true }).click();
  const archiveDialog = page.getByRole('dialog', { name: '¿Archivar esta cuenta?', exact: true });
  await expect(archiveDialog).toBeVisible();
  await archiveDialog.getByRole('button', { name: 'Archivar cuenta', exact: true }).click();

  const archivedSection = page.getByRole('region', { name: 'Cuentas archivadas', exact: true });
  await expect(archivedSection).toBeVisible();
  const archivedCard = archivedSection.locator('.account-card.archived').filter({ hasText: protectedAccName });
  await expect(archivedCard).toBeVisible();

  const archivedFlagInDb = runPsql(
    `SELECT is_archived FROM public.accounts WHERE id = '${protectedDbId}';`
  );
  expect(archivedFlagInDb).toBe('t');

  await archivedCard.getByRole('button', { name: `Ver historial de ${protectedAccName}`, exact: true }).click();
  const historyPanel = page.getByRole('region', { name: 'Historial de cuenta', exact: true });
  await expect(historyPanel).toBeVisible();
  await expect(historyPanel).toContainText(`Ingreso Real ${runId}`);
  await expect(historyPanel).toContainText('ACCOUNT_ARCHIVED');

  await archivedCard.getByRole('button', { name: `Restaurar cuenta ${protectedAccName}`, exact: true }).click();
  await expect(page.locator('.account-card:not(.archived)').filter({ hasText: protectedAccName })).toBeVisible();

  const restoredFlagInDb = runPsql(
    `SELECT is_archived FROM public.accounts WHERE id = '${protectedDbId}';`
  );
  expect(restoredFlagInDb).toBe('f');
});
