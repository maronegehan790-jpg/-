import { expect, test, type ConsoleMessage } from '@playwright/test';

// Startup session restore (initializeAuth) calls this. CI runs no backend, so it is
// answered with the backend's "no refresh cookie" response instead.
const REFRESH_PATH = '/api/v1/auth/refresh';

// Chromium logs every 4xx resource as a console error, even when the app handles it.
const REFRESH_401_LOG =
  'Failed to load resource: the server responded with a status of 401 (Unauthorized)';

function isExpectedRefresh401Log(message: ConsoleMessage): boolean {
  const source = message.location().url;
  return (
    message.text() === REFRESH_401_LOG && source !== '' && new URL(source).pathname === REFRESH_PATH
  );
}

// Phase 1 smoke test: proves the app boots and renders. No feature assertions here.
test('home page loads without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedRefresh401Log(message)) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.route(
    (url) => url.pathname === REFRESH_PATH,
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.fallback();
        return;
      }
      // Mirrors backend authController.refresh + errorHandler, including the
      // credentialed-CORS headers app.ts sends for the SPA origin.
      await route.fulfill({
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': (await request.headerValue('origin')) ?? '',
          'Access-Control-Allow-Credentials': 'true',
          Vary: 'Origin',
        },
        json: { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token.' } },
      });
    },
  );

  const refreshed = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === REFRESH_PATH,
  );
  const response = await page.goto('/');
  expect((await refreshed).status()).toBe(401);

  expect(response?.status()).toBe(200);
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
