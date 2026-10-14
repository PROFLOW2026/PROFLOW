/**
 * Gate B prep — run disposable PGlite apply via Vitest (server-only stubbed).
 * Does NOT call npm run db:migrate or touch shared/production DB.
 *
 * Usage (from repo root): node scripts/local-audit/gate-b-pglite-apply.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'vitest',
    'run',
    '--project',
    'migration',
    'tests/integration/migration/gate-b-prepared-apply.test.ts',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);
process.exit(result.status ?? 1);
