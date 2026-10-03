/**
 * Starts `next start` with the same public/runtime env the E2E harness expects.
 * Playwright's webServer `env` is not always applied reliably on Windows shells.
 */
import { spawn } from 'node:child_process';

const APP_PORT = 3100;

const harnessPublicEnv = {
  APP_ENV: 'local',
  EMPLOYEE_AUTH_PASSWORD_PEPPER: 'projectflow-e2e-employee-auth-pepper-v1',
  STORAGE_TOKEN_ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-supabase-service-role-key',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP_PORT}`,
};

const port = process.env.PLAYWRIGHT_APP_PORT ?? String(APP_PORT);

const child = spawn('npm', ['run', 'start', '--', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...harnessPublicEnv },
});

child.on('exit', (code) => process.exit(code ?? 1));
