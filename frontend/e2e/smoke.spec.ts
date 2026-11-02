import { expect, test } from '@playwright/test';

// Phase 1 smoke test: proves the app boots and renders. No feature assertions here.
test('home page loads without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
