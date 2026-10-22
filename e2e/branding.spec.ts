import { test, expect } from '@playwright/test';

test('BRAVISO resources use local vectors, correct PWA sizes and unchanged scopes', async ({ page, request }) => {
  await page.goto('/auth/login');
  await expect(page).toHaveTitle('BRAVISO — Tu dinero, en perspectiva.');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /BRAVISO/);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'BRAVISO');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'favicon.svg');
  for (const [manifestPath, scope, start] of [
    ['/manifest.webmanifest', '/', '/app'],
    ['/manifest.github-pages.webmanifest', '/personal-finance/', '/personal-finance/app'],
  ]) {
    const response = await request.get(manifestPath);
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toContain('BRAVISO');
    expect(manifest.short_name).toBe('BRAVISO');
    expect(manifest.scope).toBe(scope);
    expect(manifest.start_url).toBe(start);
  }
  for (const [file, size] of [
    ['icon-192.png', 192], ['icon-512.png', 512], ['icon-192-maskable.png', 192],
    ['icon-512-maskable.png', 512], ['apple-touch-icon.png', 180], ['favicon-32.png', 32],
  ] as const) {
    const response = await request.get(`/icons/${file}`);
    expect(response.ok()).toBeTruthy();
    const bytes = await response.body();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  for (const variant of ['horizontal', 'compact', 'symbol']) {
    for (const theme of ['light', 'dark', 'mono']) {
      const response = await request.get(`/brand/braviso-${variant}-${theme}.svg`);
      expect(response.ok()).toBeTruthy();
      const vector = await response.text();
      expect(vector).toContain('aria-label="BRAVISO"');
      expect(vector).not.toMatch(/<text|<image|@import|font-family|href=/);
    }
  }
});

test('BRAVISO remains legible on every authentication page in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password']) {
    await page.goto(route);
    for (const [colorScheme, ink] of [['light', 'rgb(40, 84, 68)'], ['dark', 'rgb(212, 229, 170)']] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('.wordmark svg')).toHaveCSS('color', ink);
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/(^|\n)\s*personal\.\s*(\n|$)|Personal Finance/);
    }
  }
});
