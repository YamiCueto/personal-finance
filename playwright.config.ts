import { defineConfig, devices } from '@playwright/test';

// Safely load local gitignored .env using Node's native loader (zero external dependencies)
try {
  process.loadEnvFile('.env');
} catch {
  // Local .env file is optional (e.g. in CI or environments using direct process.env)
}

/**
 * Playwright E2E configuration for Personal Finance.
 *
 * Configured for multi-viewport validation:
 * - 360px (Ultra-compact mobile baseline)
 * - 390px (Standard mobile - iPhone)
 * - 430px (Large mobile - iPhone Pro Max)
 * - 768px (Tablet)
 * - 1440px (Desktop)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-360',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'mobile-430',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: 'mobile-440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 440, height: 956 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
