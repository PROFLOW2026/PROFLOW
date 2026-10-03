/**

 * Capture real authenticated ProjectFlow screens for the public homepage.

 *

 * Writes PNGs under public/marketing/screenshots/{he-IL,en,ar,ru}/.

 *

 * Usage (from repo root):

 *   node scripts/capture-marketing-screenshots.mjs

 *

 * One Playwright process keeps the harness + Next server alive for the whole run.

 */

import { spawn, spawnSync } from 'node:child_process';

import { rmSync } from 'node:fs';

import { join } from 'node:path';



const E2E_PORTS = [3100, 55432, 55321];



/** Free harness/app ports so a fresh PGlite + Next pair stay in sync (Windows + Unix). */

function freeE2ePorts() {

  if (process.platform === 'win32') {

    for (const port of E2E_PORTS) {

      spawnSync(

        'powershell',

        [

          '-NoProfile',

          '-Command',

          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,

        ],

        { stdio: 'ignore' },

      );

    }

    return;

  }

  for (const port of E2E_PORTS) {

    spawnSync('sh', ['-c', `lsof -ti :${port} | xargs -r kill -9`], { stdio: 'ignore' });

  }

}



freeE2ePorts();

if (process.env.E2E_DATABASE_MODE === 'postgres') {
  const reset = spawnSync('node', ['scripts/.reset-e2e-postgres-db.mjs'], {
    stdio: 'inherit',
    shell: true,
  });
  if (reset.status !== 0) {
    process.exit(reset.status ?? 1);
  }
}

/** PGlite reseeds new org UUIDs; Next `unstable_cache` under .next/cache must not reuse prior harness data. */

function clearNextHarnessCache() {

  const nextDir = join(process.cwd(), '.next');

  try {

    rmSync(join(nextDir, 'cache'), { recursive: true, force: true });

  } catch {

    // ignore

  }

  try {

    rmSync(join(nextDir, 'lock'), { force: true });

  } catch {

    // ignore

  }

}



clearNextHarnessCache();



if (!process.env.CAPTURE_MARKETING) {

  process.env.CAPTURE_MARKETING = '1';

}



/** Must match Playwright harness public URLs — `NEXT_PUBLIC_*` is inlined at build time. */

const HARNESS_PUBLIC_ENV = {
  APP_ENV: 'local',
  EMPLOYEE_AUTH_PASSWORD_PEPPER: 'projectflow-e2e-employee-auth-pepper-v1',
  STORAGE_TOKEN_ENCRYPTION_KEY: 'e2e'.padEnd(64, '0'),
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-supabase-service-role-key',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
};



function runNpmBuild() {

  return new Promise((resolve) => {

    spawnSync('npm', ['run', 'copy-pdf-worker'], { stdio: 'inherit', shell: true });

    const child = spawn(
      'npx',
      ['next', 'build', '--webpack'],
      {
      stdio: 'inherit',

      env: { ...process.env, ...HARNESS_PUBLIC_ENV },

      shell: true,
      },
    );

    child.on('exit', (code) => resolve(code ?? 1));

  });

}



function runPlaywright(args) {

  return new Promise((resolve) => {

    const child = spawn('npx', ['playwright', 'test', ...args], {

      stdio: 'inherit',

      env: process.env,

      shell: true,

    });

    child.on('exit', (code) => resolve(code ?? 1));

  });

}



let exitCode = 0;

if (process.env.SKIP_CAPTURE_BUILD !== '1') {

  exitCode = await runNpmBuild();

  if (exitCode !== 0) {

    process.exit(exitCode);

  }

}



exitCode = await runPlaywright([

  '--project=setup-owner',

  '--project=setup-worker',

  '--project=desktop-he-authenticated',

  'tests/e2e/authenticated/capture-marketing-screenshots.spec.ts',

]);



process.exit(exitCode);


