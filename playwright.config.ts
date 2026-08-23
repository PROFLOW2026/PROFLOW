import { defineConfig, devices } from '@playwright/test';
import { ANON_KEY, APP_PORT, APP_URL, AUTH_URL, DATABASE_URL } from './tests/e2e/harness/config';

const harnessEnv = {
  APP_ENV: 'local',
  DATABASE_URL,
  DATABASE_POOL_MAX: '1',
  NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  NEXT_PUBLIC_APP_URL: APP_URL,
  OCR_INGESTION_ENABLED: 'true',
  OCR_PROVIDER: 'azure',
  OCR_PROVIDER_API_KEY: 'e2e-mock-key',
  OCR_PROVIDER_ENDPOINT: 'https://example.cognitiveservices.azure.com/',
  OCR_AZURE_TIER: 'F0',
  OCR_AZURE_QUERY_FIELDS: 'false',
  OCR_E2E_MOCK_PROVIDER: 'true',
  E2E_INMEMORY_STORAGE: 'true',
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
    {
      name: 'setup-owner',
      testMatch: /auth\/owner\.setup\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'setup-worker',
      testMatch: /auth\/worker\.setup\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-he',
      // Public shell + regression (overflow/locale). Authenticated specs run below.
      testIgnore: [/auth\//, /authenticated\//, /mobile\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-he-authenticated',
      testMatch: /authenticated\/(owner|regression|performance-verify|performance-signoff|jobs-flows|master-completion-journeys|pwa-startup|ocr-review|boq-happy-path|capture-marketing-screenshots|branding|hebrew-runtime-closure|overnight-surfaces|billing-plan|project-time-mobile-gate|project-centric-money-chain)\.spec\.ts/,
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
      name: 'desktop-he-personas',
      testMatch: /authenticated\/persona-matrix\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-he',
      testMatch: /mobile\.spec\.ts|authenticated\/workforce-discoverability\.spec\.ts|authenticated\/ocr-review\.spec\.ts|authenticated\/hebrew-runtime-closure\.spec\.ts|authenticated\/overnight-surfaces\.spec\.ts|authenticated\/billing-plan\.spec\.ts|authenticated\/mobile-money-journeys\.spec\.ts/,
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
          command: 'node --import ./tests/e2e/harness/alias-server-only.mjs --import tsx tests/e2e/harness/server.ts',
          url: `${AUTH_URL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
        {
          command: `npm run build && npm run start -- -p ${APP_PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 720_000,
          env: harnessEnv,
        },
      ],
});
