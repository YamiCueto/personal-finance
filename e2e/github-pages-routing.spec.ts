import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DIST_DIR = path.resolve(__dirname, '../dist/personal-finance/browser');
const SIM_ORIGIN = 'http://gh-pages-sim.test';
const BASE_PATH = '/personal-finance';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
};

interface ServeResult {
  status: number;
  body: Buffer | string;
  contentType: string;
}

function resolveDistFile(urlPathname: string): ServeResult {
  let relPath = urlPathname.startsWith(BASE_PATH) ? urlPathname.slice(BASE_PATH.length) : urlPathname;
  if (!relPath || relPath === '/') relPath = '/index.html';

  let filePath = path.join(DIST_DIR, relPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    return { status: 200, body: fs.readFileSync(filePath), contentType: MIME[ext] ?? 'application/octet-stream' };
  }
  return { status: 404, body: '404 Not Found', contentType: 'text/plain' };
}

function resolveDistFileWithFallback(urlPathname: string): ServeResult {
  const result = resolveDistFile(urlPathname);
  if (result.status !== 404) return result;

  const fallbackPath = path.join(DIST_DIR, '404.html');
  if (fs.existsSync(fallbackPath)) {
    return { status: 404, body: fs.readFileSync(fallbackPath), contentType: 'text/html; charset=utf-8' };
  }
  return result;
}

const distExists = fs.existsSync(path.join(DIST_DIR, 'index.html'));

test.describe('GitHub Pages — Enrutamiento SPA (sin fallback Angular)', () => {
  test.skip(!distExists, 'Requiere build: ng build --configuration github-pages');

  test.beforeEach(async ({ page }) => {
    await page.route(`${SIM_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const result = resolveDistFile(url.pathname);
      await route.fulfill({ status: result.status, body: result.body, contentType: result.contentType });
    });
  });

  test('ROJO — /auth/reset-password devuelve 404 sin Angular', async ({ page }) => {
    const response = await page.goto(`${SIM_ORIGIN}${BASE_PATH}/auth/reset-password`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    await expect(page.locator('app-root')).not.toBeAttached();
  });

  test('ROJO — /auth/login devuelve 404 sin Angular', async ({ page }) => {
    const response = await page.goto(`${SIM_ORIGIN}${BASE_PATH}/auth/login`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    await expect(page.locator('app-root')).not.toBeAttached();
  });

  test('ROJO — /app devuelve 404 sin Angular', async ({ page }) => {
    const response = await page.goto(`${SIM_ORIGIN}${BASE_PATH}/app`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    await expect(page.locator('app-root')).not.toBeAttached();
  });
});

test.describe('GitHub Pages — Enrutamiento SPA con 404.html fallback', () => {
  test.skip(!distExists, 'Requiere build: ng build --configuration github-pages');

  test.beforeEach(async ({ page }) => {
    await page.route(`${SIM_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const result = resolveDistFileWithFallback(url.pathname);
      await route.fulfill({ status: result.status, body: result.body, contentType: result.contentType });
    });
  });

  test('VERDE — 404.html existe en el build de github-pages', () => {
    const fallbackPath = path.join(DIST_DIR, '404.html');
    expect(fs.existsSync(fallbackPath), `404.html no encontrado en ${fallbackPath}`).toBe(true);

    const content = fs.readFileSync(fallbackPath, 'utf-8');
    expect(content).toContain('pathSegmentsToKeep');
    expect(content).toContain('l.replace');
    expect(content).toContain('/?/');
  });

  test('VERDE — index.html contiene el script de restauración de ruta', () => {
    const indexPath = path.join(DIST_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain("l.search[1] === '/'");
    expect(content).toContain('history.replaceState');
    expect(content).toContain('~and~');
  });

  test('VERDE — recarga en /auth/reset-password redirige a Angular via 404.html', async ({ page }) => {
    await page.goto(`${SIM_ORIGIN}${BASE_PATH}/auth/reset-password`, { waitUntil: 'networkidle' });
    await expect(page.locator('app-root')).toBeAttached({ timeout: 10000 });
  });

  test('VERDE — recarga en /auth/login redirige a Angular y muestra formulario', async ({ page }) => {
    await page.goto(`${SIM_ORIGIN}${BASE_PATH}/auth/login`, { waitUntil: 'networkidle' });
    await expect(page.locator('app-root')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('form')).toBeVisible({ timeout: 10000 });
  });

  test('VERDE — token Supabase en fragment se preserva tras la redirección', async ({ page }) => {
    const mockToken = 'eyJmYWtlLXRva2VuLWZvci10ZXN0fQ';
    await page.goto(`${SIM_ORIGIN}${BASE_PATH}/auth/reset-password#access_token=${mockToken}&type=recovery`, {
      waitUntil: 'networkidle',
    });

    await expect(page.locator('app-root')).toBeAttached({ timeout: 10000 });

    const finalUrl = page.url();
    expect(finalUrl).toContain(`access_token=${mockToken}`);
    expect(finalUrl).toContain('type=recovery');
  });

  test('VERDE — ruta raíz /personal-finance/ sirve index.html con status 200', async ({ page }) => {
    const response = await page.goto(`${SIM_ORIGIN}${BASE_PATH}/`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('app-root')).toBeAttached({ timeout: 10000 });
  });

  test('BRAVISO conserva base href, rutas de instalación e iconos bajo el subdirectorio', async ({ page }) => {
    await page.goto(`${SIM_ORIGIN}${BASE_PATH}/auth/login`, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle('BRAVISO — Tu dinero, en perspectiva.');
    await expect(page.locator('base')).toHaveAttribute('href', '/personal-finance/');
    const resources = await page.evaluate(async () => {
      const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
      const manifestResponse = await fetch(manifestLink.href);
      const manifest = await manifestResponse.json();
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
      const faviconResponse = await fetch(favicon.href);
      const icons = await Promise.all(manifest.icons.map(async (icon: { src: string }) => {
        const response = await fetch(new URL(icon.src, manifestLink.href));
        return response.status;
      }));
      return { name: manifest.short_name, scope: manifest.scope, start: manifest.start_url, favicon: favicon.href, faviconStatus: faviconResponse.status, icons };
    });
    expect(resources.name).toBe('BRAVISO');
    expect(resources.scope).toBe('/personal-finance/');
    expect(resources.start).toBe('/personal-finance/app');
    expect(resources.favicon).toBe(`${SIM_ORIGIN}${BASE_PATH}/favicon.svg`);
    expect(resources.faviconStatus).toBe(200);
    expect(resources.icons).toEqual([200, 200, 200, 200]);
  });
});
