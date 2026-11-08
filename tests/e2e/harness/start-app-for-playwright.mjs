/**
 * Starts `next start` with the same public/runtime env the E2E harness expects.
 * Playwright's webServer `env` is not always applied reliably on Windows shells.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_PORT = 3100;

const graphHook = pathToFileURL(path.resolve('tests/e2e/harness/e2e-graph-storage-hook.mjs')).href;
const nodeOptions = [process.env.NODE_OPTIONS, `--import ${graphHook}`].filter(Boolean).join(' ');

const harnessPublicEnv = {
  APP_ENV: 'local',
  EMPLOYEE_AUTH_PASSWORD_PEPPER: 'projectflow-e2e-employee-auth-pepper-v1',
  STORAGE_TOKEN_ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-supabase-service-role-key',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
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
  NODE_OPTIONS: nodeOptions,
};

const port = process.env.PLAYWRIGHT_APP_PORT ?? String(APP_PORT);

const child = spawn('npm', ['run', 'start', '--', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...harnessPublicEnv },
});

child.on('exit', (code) => process.exit(code ?? 1));
