import { test, expect } from '@playwright/test';
import { MOCK_USER_A, setupSupabaseMocks, injectAuthenticatedSession } from './helpers/auth-mocks';
import { openModule } from './helpers/navigation';

test.beforeEach(async ({ page }) => {
  await setupSupabaseMocks(page);
  await page.goto('/auth/login');
  await injectAuthenticatedSession(page, MOCK_USER_A);
  await page.goto('/app');
  await expect(page.locator('#main-content')).toBeVisible();
});

test('cuenta sin historial: acciones independientes de eliminar, archivar, consultar historial y restaurar', async ({ page }, info) => {
  await openModule(page, 'accounts');
  await page.getByRole('button', {name:'+ Cuenta',exact:true}).click();
  await page.locator('#acc-name').fill('Cuenta creada por error');
  await page.getByRole('button',{name:'Guardar Cuenta',exact:true}).click();
  const card = page.locator('.account-card').filter({hasText:'Cuenta creada por error'});
  await expect(card.getByRole('button',{name:'Archivar cuenta Cuenta creada por error',exact:true})).toBeVisible();
  await expect(card.getByRole('button',{name:'Eliminar cuenta Cuenta creada por error',exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Eliminar cuenta Cuenta creada por error',exact:true}).click();
  const deleteDialog = page.getByRole('dialog', { name: '¿Eliminar esta cuenta?', exact: true });
  await expect(deleteDialog).toBeVisible();
  await page.screenshot({path:info.outputPath('eliminar-cuenta-claro.png')});
  await deleteDialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(card).toBeVisible();
  await page.getByRole('button',{name:'Activar tema oscuro'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await card.getByRole('button',{name:'Eliminar cuenta Cuenta creada por error',exact:true}).click();
  await deleteDialog.getByLabel(/Motivo de eliminación/).fill('Cuenta abierta por error');
  await page.screenshot({path:info.outputPath('eliminar-cuenta-oscuro.png')});
  await deleteDialog.getByRole('button',{name:'Eliminar cuenta',exact:true}).click();
  await expect(card).toHaveCount(0);

  const mainCard = page.locator('.account-card').filter({hasText:'Cuenta Principal Ahorros'});
  await mainCard.getByRole('button',{name:'Eliminar cuenta Cuenta Principal Ahorros',exact:true}).click();
  await expect(deleteDialog.getByRole('button',{name:'Archivar cuenta'})).toHaveCount(0);
  await deleteDialog.getByRole('button',{name:'Eliminar cuenta',exact:true}).click();
  await expect(deleteDialog.getByRole('alert')).toContainText('historial financiero');
  await expect(deleteDialog.getByRole('button',{name:'Archivar cuenta',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('cuenta-protegida.png')});
  await deleteDialog.getByRole('button',{name:'Archivar cuenta',exact:true}).click();

  const archivedSection = page.getByRole('region', { name: 'Cuentas archivadas', exact: true });
  await expect(archivedSection).toBeVisible();
  const archivedCard = archivedSection.locator('.account-card.archived').filter({hasText:'Cuenta Principal Ahorros'});
  await expect(archivedCard).toBeVisible();

  await archivedCard.getByRole('button',{name:'Ver historial de Cuenta Principal Ahorros',exact:true}).click();
  const historyPanel = page.getByRole('region', { name: 'Historial de cuenta', exact: true });
  await expect(historyPanel).toBeVisible();
  await expect(historyPanel).toContainText('Cuenta Principal Ahorros');

  await archivedCard.getByRole('button',{name:'Restaurar cuenta Cuenta Principal Ahorros',exact:true}).click();
  await expect(page.locator('.account-card:not(.archived)').filter({hasText:'Cuenta Principal Ahorros'})).toBeVisible();

  await page.locator('.account-card:not(.archived)').filter({hasText:'Cuenta Principal Ahorros'}).getByRole('button',{name:'Archivar cuenta Cuenta Principal Ahorros',exact:true}).click();
  const archiveDialog = page.getByRole('dialog', { name: '¿Archivar esta cuenta?', exact: true });
  await expect(archiveDialog).toBeVisible();
  await archiveDialog.getByRole('button',{name:'Archivar cuenta',exact:true}).click();
  await expect(page.locator('.account-card.archived')).toContainText('Cuenta Principal Ahorros');

  await openModule(page,'incomes');
  await page.getByRole('button',{name:/Ingreso/}).filter({hasText:'+'}).first().click();
  await expect(page.locator('#inc-acc option').filter({hasText:'Cuenta Principal Ahorros'})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('deuda existente: corte, pago, historial anual, ajuste y reverso', async ({ page }, info) => {
  await openModule(page,'credits');
  await page.getByRole('button',{name:'Registrar deuda existente',exact:true}).click();
  const form = page.getByRole('form',{name:'Registrar deuda existente'});
  await form.getByLabel('Nombre de la obligación').fill('Vehículo con seguimiento');
  await form.getByLabel('Entidad acreedora').selectOption({label:'Banco de Occidente'});
  await form.getByLabel('Saldo confirmado').fill('18000000');
  await form.getByLabel('Fecha de corte').fill('2026-10-24');
  await form.getByLabel('Próximo vencimiento').fill('2026-11-15');
  await form.getByLabel('Valor de la próxima cuota').fill('750000');
  await form.getByLabel('Cuotas pendientes').fill('24');
  await form.getByLabel('Intereses conocidos').fill('150000');
  await form.getByLabel('Seguro por cuota').fill('30000');
  await form.getByRole('button',{name:'Guardar deuda'}).click();
  const detail = page.getByRole('article',{name:'Detalle de obligación'});
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button',{name:/Enero/})).toContainText('Sin historial registrado');
  await detail.getByRole('button',{name:'Generar cuota de Noviembre',exact:true}).click();
  await detail.getByRole('button',{name:'Registrar pago',exact:true}).click();
  const payment = page.getByRole('form',{name:'Registrar pago de deuda'});
  await payment.getByLabel('Fecha del pago').fill('2026-11-15');
  await payment.getByLabel('Importe pagado').fill('200000');
  await expect(payment.getByLabel('Intereses pagados')).toHaveValue('150000');
  await expect(payment.getByLabel('Seguro pagado')).toHaveValue('30000');
  await expect(payment.getByLabel('Capital pagado')).toHaveValue('20000');
  await payment.getByLabel('Importe pagado').fill('750000');
  await expect(payment.getByLabel('Capital pagado')).toHaveValue('570000');
  await payment.getByLabel('Referencia').fill('Extracto de prueba');
  await payment.getByRole('button',{name:'Guardar pago',exact:true}).click();
  await expect(detail.locator('.metrics').first()).toContainText('17.430.000');
  await detail.evaluate(element => element.scrollIntoView({block:'start'}));
  await page.screenshot({path:info.outputPath('trazabilidad-claro.png')});
  await page.getByRole('button',{name:'Activar tema oscuro'}).click();
  await expect(detail).toHaveCSS('background-color','rgb(16, 26, 21)');
  await detail.evaluate(element => element.scrollIntoView({block:'start'}));
  await page.screenshot({path:info.outputPath('trazabilidad-oscuro.png')});
  await detail.getByRole('button',{name:'Año siguiente'}).click();
  await expect(detail.locator('.annual')).toContainText('17.430.000');
  await detail.getByRole('button',{name:'Año anterior'}).click();
  await expect(detail.locator('.payment')).toContainText('570.000');
  await detail.getByRole('button',{name:'Conciliar saldo con extracto',exact:true}).click();
  const reconcile = page.getByRole('form',{name:'Conciliación',exact:true});
  await reconcile.getByLabel('Fecha del extracto').fill('2026-11-30');
  await reconcile.getByLabel('Saldo reportado').fill('17440000');
  await reconcile.getByLabel('Motivo del ajuste').fill('Diferencia confirmada');
  await reconcile.getByRole('button',{name:'Registrar ajuste'}).click();
  await expect(detail).toContainText('Diferencia confirmada');
  await detail.getByRole('button',{name:'Revertir pago',exact:true}).click();
  await detail.getByLabel('Motivo del reverso').fill('Corrección de prueba');
  await detail.getByRole('button',{name:'Confirmar reverso'}).click();
  await expect(detail).toContainText('Corrección de prueba');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
