import { defineConfig, devices } from '@playwright/test';

/**
 * Design-switch tests against `next dev` and the local PGlite harness.
 * Does not call `next build` and does not replace playwright.config.ts.
 * Database and auth are forced to 127.0.0.1 inside start-design-dev.mjs.
 *
 * One process that also compiles the engine routes is not a valid full-suite
 * result. After design-engines.spec.ts, authenticated navigations stop reaching
 * `load` within 45s while signed-out pages still return. workers is 1 and each
 * test clears cookies, so this is the shared dev server (PGlite pool size 1),
 * not shared browser state. Run groups with tests/e2e/harness/run-design-groups.mjs
 * so each group gets a fresh server. A combined failure is not a PASS.
 */
const baseURL = 'http://127.0.0.1:3100';
const harnessEnv: Record<string, string> = {
  APP_ENV: 'local',
  E2E_DATABASE_MODE: 'pglite',
  E2E_DATABASE_PORT: '55432',
  DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/postgres',
  DIRECT_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/postgres',
  DATABASE_POOL_MAX: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_APP_URL: baseURL,
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-supabase-service-role-key',
  STORAGE_TOKEN_ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
  EMPLOYEE_AUTH_PASSWORD_PEPPER: 'projectflow-e2e-employee-auth-pepper-v1',
  E2E_INMEMORY_STORAGE: 'true',
  OCR_E2E_MOCK_PROVIDER: 'true',
  TAKEOFF_USE_FAKE_WORKER: '1',
  TAKEOFF_FILE_STORE: 'memory',
  NEXT_DIST_DIR: '.next-design-dev',
};

export default defineConfig({
  testDir: './tests/e2e/design',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'design-dev',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node --import ./tests/e2e/harness/alias-server-only.mjs --import tsx tests/e2e/harness/server.ts',
      url: 'http://127.0.0.1:55321/health',
      reuseExistingServer: false,
      timeout: 360_000,
      env: harnessEnv,
    },
    {
      command: 'node tests/e2e/harness/start-design-dev.mjs',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 360_000,
      env: { ...harnessEnv, PLAYWRIGHT_APP_PORT: '3100' },
    },
  ],
});
