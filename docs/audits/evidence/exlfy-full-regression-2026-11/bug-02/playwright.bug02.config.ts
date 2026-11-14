/**
 * Isolated BUG-02 Playwright config (harness-only).
 * Prefer E2E_DATABASE_MODE=postgres + projectflow_e2e on Windows.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import {
  ANON_KEY,
  APP_URL,
  AUTH_URL,
  DATABASE_PORT,
  DATABASE_URL as PGLITE_DATABASE_URL,
  E2E_STORAGE_TOKEN_ENCRYPTION_KEY,
  E2E_SUPABASE_SERVICE_ROLE_KEY,
  E2E_EMPLOYEE_AUTH_PASSWORD_PEPPER,
} from '../../../../../tests/e2e/harness/config';
import {
  e2eDatabaseMode,
  isPostgresHarnessMode,
  resolveHarnessDatabaseUrl,
} from '../../../../../tests/e2e/harness/database-mode';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(evidenceDir, '../../../../..');
const harnessDatabaseUrl = resolveHarnessDatabaseUrl(PGLITE_DATABASE_URL);

const harnessEnv: Record<string, string> = {
  APP_ENV: 'local',
  DATABASE_URL: harnessDatabaseUrl,
  DIRECT_DATABASE_URL: harnessDatabaseUrl,
  E2E_DATABASE_MODE: e2eDatabaseMode(),
  NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  NEXT_PUBLIC_APP_URL: APP_URL,
  E2E_INMEMORY_STORAGE: 'true',
  STORAGE_TOKEN_ENCRYPTION_KEY: E2E_STORAGE_TOKEN_ENCRYPTION_KEY,
  SUPABASE_SERVICE_ROLE_KEY: E2E_SUPABASE_SERVICE_ROLE_KEY,
  EMPLOYEE_AUTH_PASSWORD_PEPPER: E2E_EMPLOYEE_AUTH_PASSWORD_PEPPER,
  PF_DESIGN_SPECIMEN: '1',
  OCR_INGESTION_ENABLED: 'true',
  OCR_PROVIDER: 'azure',
  OCR_PROVIDER_API_KEY: 'e2e-mock-key',
  OCR_PROVIDER_ENDPOINT: 'https://example.cognitiveservices.azure.com/',
  OCR_AZURE_TIER: 'F0',
  OCR_AZURE_QUERY_FIELDS: 'false',
  OCR_E2E_MOCK_PROVIDER: 'true',
};
if (!isPostgresHarnessMode()) harnessEnv.DATABASE_POOL_MAX = '1';

const harnessServerEnv: Record<string, string> = {
  E2E_DATABASE_MODE: e2eDatabaseMode(),
  E2E_DATABASE_PORT: String(DATABASE_PORT),
  DATABASE_URL: harnessDatabaseUrl,
  DIRECT_DATABASE_URL: harnessDatabaseUrl,
  STORAGE_TOKEN_ENCRYPTION_KEY: E2E_STORAGE_TOKEN_ENCRYPTION_KEY,
  SUPABASE_SERVICE_ROLE_KEY: E2E_SUPABASE_SERVICE_ROLE_KEY,
  EMPLOYEE_AUTH_PASSWORD_PEPPER: E2E_EMPLOYEE_AUTH_PASSWORD_PEPPER,
  APP_ENV: 'local',
};

const harnessEnvWithPort: Record<string, string> = {
  ...harnessEnv,
  E2E_DATABASE_PORT: String(DATABASE_PORT),
  ...(process.env.E2E_HARNESS_SETTLE_MS
    ? { E2E_HARNESS_SETTLE_MS: process.env.E2E_HARNESS_SETTLE_MS }
    : {}),
};

export default defineConfig({
  testDir: evidenceDir,
  testMatch: /bug-02-payroll-deep-link\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(evidenceDir, 'logs', 'playwright-results.json') }],
  ],
  outputDir: path.join(evidenceDir, 'logs', 'playwright-output'),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? APP_URL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'setup-owner',
      // Harness-only rewrite when .next was baked against .env.local Supabase.
      testMatch: /owner-auth-stub\.setup\.ts/,
    },
    {
      name: 'bug02-payroll',
      dependencies: ['setup-owner'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(rootDir, 'tests/e2e/.auth/owner.json'),
      },
    },
  ],
  // Relative --import paths (Windows-safe). Absolute `c:` paths break Node ESM loader.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command:
            'node --import ./tests/e2e/harness/alias-server-only.mjs --import tsx tests/e2e/harness/server.ts',
          cwd: rootDir,
          url: `${AUTH_URL}/health`,
          reuseExistingServer: !process.env.CI && !process.env.E2E_FORCE_FRESH_SERVER,
          timeout: 240_000,
          env: harnessServerEnv,
        },
        {
          command:
            process.env.BUG02_USE_NEXT_DEV === '1'
              ? `node ${JSON.stringify(path.join(evidenceDir, 'start-app-dev-for-bug02.mjs'))}`
              : 'node tests/e2e/harness/wait-and-start-app.mjs',
          cwd: rootDir,
          url: process.env.PLAYWRIGHT_BASE_URL ?? APP_URL,
          reuseExistingServer: !process.env.CI && !process.env.E2E_FORCE_FRESH_SERVER,
          timeout: process.env.BUG02_USE_NEXT_DEV === '1' ? 420_000 : 240_000,
          env: {
            ...harnessEnvWithPort,
            E2E_SKIP_BUILD: process.env.E2E_SKIP_BUILD ?? '1',
          },
        },
      ],
});
