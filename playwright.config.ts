import { defineConfig, devices } from '@playwright/test';
import {
  DEFAULT_SELECTED_MODULES,
  SETUP_CONFIG_STORAGE_KEY,
} from './src/constants/setupModules';

const port = process.env.PLAYWRIGHT_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // Existing operational tests exercise a developer-configured installation.
    // Fresh-install onboarding tests explicitly override this with empty storage.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            {
              name: SETUP_CONFIG_STORAGE_KEY,
              value: JSON.stringify({
                enabledModules: DEFAULT_SELECTED_MODULES,
                configuredBy: 'e2e-legacy-setup',
                configuredAt: '2026-01-01T00:00:00.000Z',
                moduleCatalogVersion: 13,
              }),
            },
          ],
        },
      ],
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
    env: { VITE_WEB_TRIAL_MODULE_BYPASS: 'true' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
