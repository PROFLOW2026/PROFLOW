import { defineConfig, devices } from '@playwright/test';
import { ANON_KEY, APP_PORT, APP_URL, AUTH_URL, DATABASE_URL } from './tests/e2e/harness/config';

const harnessEnv = {
  DATABASE_URL,
  DATABASE_POOL_MAX: '1',
  NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  NEXT_PUBLIC_APP_URL: APP_URL,
};

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? APP_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [
    { name: 'setup-owner', testMatch: /auth\/owner\.setup\.ts/ },
    { name: 'setup-worker', testMatch: /auth\/worker\.setup\.ts/ },
    {
      name: 'desktop-he',
      testIgnore: [/auth\//, /authenticated\//, /mobile\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-he-authenticated',
      testMatch: /authenticated\/owner\.spec\.ts/,
      dependencies: ['setup-owner'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
    {
      name: 'desktop-he-worker',
      testMatch: /authenticated\/worker\.spec\.ts/,
      dependencies: ['setup-worker'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/e2e/.auth/worker.json',
      },
    },
    {
      name: 'mobile-he',
      testMatch: /mobile\.spec\.ts/,
      dependencies: ['setup-owner'],
      use: {
        ...devices['Pixel 7'],
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command: 'npx tsx tests/e2e/harness/server.ts',
          url: `${AUTH_URL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
        {
          command: `npm run build && npm run start -- -p ${APP_PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
          env: harnessEnv,
        },
      ],
});
