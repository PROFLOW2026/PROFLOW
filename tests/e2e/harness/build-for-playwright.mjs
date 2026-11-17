/**
 * Production build with NEXT_PUBLIC_* aimed at the local E2E auth/app ports.
 * Without this, a developer `.env.local` bake breaks sign-in against the auth stub.
 */
import { spawnSync } from 'node:child_process';

const AUTH_PORT = 55321;
const APP_PORT = 3100;

const env = {
  ...process.env,
  APP_ENV: 'local',
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${AUTH_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP_PORT}`,
};

const buildEnv = {
  ...env,
  ...(process.env.E2E_SKIP_BUILD_TYPECHECK === '1' ? { E2E_SKIP_BUILD_TYPECHECK: '1' } : {}),
};

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: buildEnv,
});

process.exit(result.status ?? 1);
