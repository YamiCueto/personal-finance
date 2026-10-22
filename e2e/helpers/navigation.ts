import { Page, expect } from '@playwright/test';

export async function openModule(page: Page, module: 'waterfall' | 'obligations' | 'credits' | 'cards' | 'simulators' | 'incomes' | 'accounts') {
  await expect(page.locator('.app-layout')).toBeVisible();
  const desktopButton = page.getByTestId(`tab-${module}`);
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
    return;
  }
  const labels = { waterfall: 'Ir al resumen', credits: 'Ir a Créditos', cards: 'Ir a Tarjetas', simulators: 'Ir a Simuladores' };
  if (module in labels) {
    await page.getByRole('button', { name: labels[module as keyof typeof labels], exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: 'Más opciones de navegación' }).click();
  const moreLabels = { obligations: 'Obligaciones', incomes: 'Ingresos', accounts: 'Cuentas' };
  await page.getByRole('dialog', { name: 'Más funcionalidades' }).getByRole('button', { name: new RegExp(moreLabels[module as keyof typeof moreLabels]) }).click();
}
