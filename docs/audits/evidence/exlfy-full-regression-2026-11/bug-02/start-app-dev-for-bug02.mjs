/**
 * AUDIT-ONLY: start Next.js in `next dev` for BUG-02 when production `.next` is missing.
 * Uses harness public env so browser Auth hits :55321 even without a rebuild.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(evidenceDir, '../../../../..');
const APP_PORT = 3100;
const AUTH_PORT = 55321;

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  'postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e';

const AUTH_HEALTH = process.env.E2E_AUTH_HEALTH_URL ?? `http://127.0.0.1:${AUTH_PORT}/health`;
const MAX_WAIT_MS = Number(process.env.E2E_HARNESS_WAIT_MS ?? 240_000);
const SETTLE_MS = Number(process.env.E2E_HARNESS_SETTLE_MS ?? 15_000);

async function waitForHarness() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(AUTH_HEALTH, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        console.log('[bug02] harness auth healthy, starting next dev…');
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Harness auth not ready within ${MAX_WAIT_MS}ms (${AUTH_HEALTH})`);
}

await waitForHarness();

const env = {
  ...process.env,
  APP_ENV: 'local',
  E2E_DATABASE_MODE: process.env.E2E_DATABASE_MODE ?? 'postgres',
  DATABASE_URL: databaseUrl,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL?.trim() || databaseUrl,
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
  PORT: String(APP_PORT),
};

const child = spawn('npx', ['next', 'dev', '--webpack', '-p', String(APP_PORT)], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => process.exit(code ?? 1));
