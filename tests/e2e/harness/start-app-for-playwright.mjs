/**
 * Starts `next start` with the same public/runtime env the E2E harness expects.
 * Playwright's webServer `env` is not always applied reliably on Windows shells.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_PORT = 3100;
const AUTH_PORT = 55321;
const dbPort = process.env.E2E_DATABASE_PORT ?? '55432';
const databaseUrl =
  process.env.DATABASE_URL?.trim() || `postgres://postgres@127.0.0.1:${dbPort}/postgres`;

const graphHook = pathToFileURL(path.resolve('tests/e2e/harness/e2e-graph-storage-hook.mjs')).href;
const nodeOptions = [process.env.NODE_OPTIONS, `--import ${graphHook}`].filter(Boolean).join(' ');

const harnessPublicEnv = {
  APP_ENV: 'local',
  E2E_DATABASE_MODE: process.env.E2E_DATABASE_MODE ?? 'pglite',
  DATABASE_URL: databaseUrl,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL?.trim() || databaseUrl,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? '1',
  EMPLOYEE_AUTH_PASSWORD_PEPPER: 'projectflow-e2e-employee-auth-pepper-v1',
  STORAGE_TOKEN_ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-supabase-service-role-key',
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${AUTH_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP_PORT}`,
  OCR_INGESTION_ENABLED: 'true',
  OCR_PROVIDER: 'azure',
  OCR_PROVIDER_API_KEY: 'e2e-mock-key',
  OCR_PROVIDER_ENDPOINT: 'https://example.cognitiveservices.azure.com/',
  OCR_AZURE_TIER: 'F0',
  OCR_AZURE_QUERY_FIELDS: 'false',
  OCR_E2E_MOCK_PROVIDER: 'true',
  E2E_INMEMORY_STORAGE: 'true',
  TAKEOFF_USE_FAKE_WORKER: process.env.TAKEOFF_USE_FAKE_WORKER ?? '1',
  TAKEOFF_FILE_STORE: process.env.TAKEOFF_FILE_STORE ?? 'memory',
  TAKEOFF_WORKER_SECRET: process.env.TAKEOFF_WORKER_SECRET ?? 'e2e-takeoff-worker-secret-32chars!!',
  NODE_OPTIONS: nodeOptions,
};

const port = process.env.PLAYWRIGHT_APP_PORT ?? String(APP_PORT);

const child = spawn('npm', ['run', 'start', '--', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...harnessPublicEnv },
});

child.on('exit', (code) => process.exit(code ?? 1));
