/**
 * Starts `next dev` for the design Playwright config only.
 * Does not run `next build`. Refuses any database or auth host that is not loopback.
 * The existing production-build harness in playwright.config.ts is unchanged.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_PORT = process.env.PLAYWRIGHT_APP_PORT ?? '3100';
const AUTH_HEALTH = process.env.E2E_AUTH_HEALTH_URL ?? 'http://127.0.0.1:55321/health';
const DATABASE_URL = 'postgres://postgres@127.0.0.1:55432/postgres';

const localEnv = {
  APP_ENV: 'local',
  E2E_DATABASE_MODE: 'pglite',
  DATABASE_URL,
  DIRECT_DATABASE_URL: DATABASE_URL,
  DATABASE_POOL_MAX: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP_PORT}`,
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-supabase-service-role-key',
  STORAGE_TOKEN_ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
  EMPLOYEE_AUTH_PASSWORD_PEPPER: 'projectflow-e2e-employee-auth-pepper-v1',
  E2E_INMEMORY_STORAGE: 'true',
  OCR_E2E_MOCK_PROVIDER: 'true',
  TAKEOFF_USE_FAKE_WORKER: '1',
  TAKEOFF_FILE_STORE: 'memory',
  NEXT_DIST_DIR: '.next-design-dev',
};

for (const [key, value] of Object.entries(localEnv)) {
  process.env[key] = value;
}

function assertLoopback(label, raw) {
  const host = new URL(raw).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`${label} is not loopback (${host}). Design dev tests will not start.`);
  }
}

assertLoopback('DATABASE_URL', process.env.DATABASE_URL);
assertLoopback('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
if (process.env.E2E_DATABASE_MODE !== 'pglite') {
  throw new Error('Design dev tests require E2E_DATABASE_MODE=pglite');
}

const deadline = Date.now() + Number(process.env.E2E_HARNESS_WAIT_MS ?? 240_000);
let authReady = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(AUTH_HEALTH, { signal: AbortSignal.timeout(5_000) });
    if (response.ok) {
      authReady = true;
      break;
    }
  } catch {
    /* harness still booting */
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (!authReady) {
  throw new Error(`Local auth harness not ready at ${AUTH_HEALTH}`);
}

// Each harness boot creates a new PGlite database and new organization ids.
// User ids stay fixed, so a persisted Next data cache would replay the previous
// seed's memberships and reject a valid login. Turbopack keeps that cache under
// `.next-design-dev/dev/cache`, not the production `.next/cache` path.
rmSync(path.resolve('.next-design-dev', 'dev', 'cache'), { recursive: true, force: true });

const graphHook = pathToFileURL(path.resolve('tests/e2e/harness/e2e-graph-storage-hook.mjs')).href;
const nodeOptions = [process.env.NODE_OPTIONS, `--import ${graphHook}`].filter(Boolean).join(' ');

const child = spawn(
  'npx',
  ['next', 'dev', '-p', APP_PORT, '-H', '127.0.0.1'],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...localEnv, NODE_OPTIONS: nodeOptions },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
