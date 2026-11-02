import { defineConfig, devices } from '@playwright/test';

// Keep this in sync with `server.port` in vite.config.ts.
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  // End-to-end specs live here, separate from the Vitest unit tests in `tests/`.
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // Chromium only: the sole browser we install, to keep the toolchain small.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Boots the Vite dev server for the duration of the run.
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
