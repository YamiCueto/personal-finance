import { Page } from '@playwright/test';

export interface MockUserConfig {
  id: string;
  email: string;
  token?: string;
  refreshToken?: string;
}

export const MOCK_USER_A: MockUserConfig = {
  id: 'usr_mock_alpha_001',
  email: 'mock-user-a@personalfinance.vault',
  token: 'mock-jwt-token-alpha',
  refreshToken: 'mock-refresh-token-alpha',
};

export const MOCK_USER_B: MockUserConfig = {
  id: 'usr_mock_beta_002',
  email: 'mock-user-b@personalfinance.vault',
  token: 'mock-jwt-token-beta',
  refreshToken: 'mock-refresh-token-beta',
};

export function buildSessionPayload(user: MockUserConfig, expiresIn = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  return {
    access_token: user.token || 'mock-access-token',
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: expiresAt,
    refresh_token: user.refreshToken || 'mock-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

export async function setupSupabaseMocks(page: Page) {
  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/logout') || url.includes('/auth/v1/token?grant_type=logout')) {
      return route.fulfill({
        status: 204,
        contentType: 'application/json',
        body: '',
      });
    }

    if (url.includes('/auth/v1/user') && method === 'GET') {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Missing access token', code: 401 }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

export async function mockLoginSuccess(page: Page, user: MockUserConfig = MOCK_USER_A) {
  const sessionData = buildSessionPayload(user);
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionData),
    });
  });
  await page.route('**/auth/v1/user', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionData.user),
    });
  });
}

export async function mockLoginFailure(page: Page, errorMessage = 'Invalid login credentials', errorCode = 'invalid_credentials') {
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: errorCode,
        error_description: errorMessage,
        code: errorCode,
        msg: errorMessage,
      }),
    });
  });
}

export async function mockNetworkFailure(page: Page, endpointPattern = '**/auth/v1/**') {
  await page.route(endpointPattern, async (route) => {
    return route.abort('failed');
  });
}

export async function mockSignupSuccess(page: Page, user: MockUserConfig = MOCK_USER_A, requireConfirmation = false) {
  const sessionData = buildSessionPayload(user);
  await page.route('**/auth/v1/signup', async (route) => {
    if (requireConfirmation) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: user.id,
          aud: 'authenticated',
          role: '',
          email: user.email,
          email_confirmed_at: null,
          user_metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionData),
    });
  });
}

export async function mockSignupFailure(page: Page, errorMessage = 'User already registered', errorCode = 'user_already_exists') {
  await page.route('**/auth/v1/signup', async (route) => {
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: errorCode,
        error_description: errorMessage,
        code: errorCode,
        msg: errorMessage,
      }),
    });
  });
}

export async function injectAuthenticatedSession(page: Page, user: MockUserConfig = MOCK_USER_A) {
  const session = buildSessionPayload(user);
  const storageKey = 'sb-vcukikhnljcmitccrqng-auth-token';

  await page.addInitScript(
    ({ key, value }) => {
      if (window.sessionStorage.getItem('__mock_logged_out__') !== 'true') {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: storageKey, value: session }
  );

  await page.route('**/auth/v1/user', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session.user),
    });
  });
}

export async function injectExpiredSession(page: Page, user: MockUserConfig = MOCK_USER_A) {
  const session = buildSessionPayload(user, -3600);
  const storageKey = 'sb-vcukikhnljcmitccrqng-auth-token';

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: storageKey, value: session }
  );

  await page.route('**/auth/v1/token?grant_type=refresh_token', async (route) => {
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Refresh token expired or revoked',
      }),
    });
  });

  await page.route('**/auth/v1/user', async (route) => {
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Token expired', code: 401 }),
    });
  });
}
