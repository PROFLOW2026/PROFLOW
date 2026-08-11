import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const serverOnlyStub = path.resolve(rootDir, 'tests/setup/server-only-stub.ts');
const fileTiming = path.resolve(rootDir, 'tests/setup/file-timing.ts');
const pgliteLifecycle = path.resolve(rootDir, 'tests/setup/pglite-lifecycle.ts');

const sharedResolve = {
  tsconfigPaths: true as const,
  alias: {
    // Production still throws if a client bundle imports real `server-only`.
    'server-only': serverOnlyStub,
  },
};

const reporters = process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'];

export default defineConfig({
  resolve: sharedResolve,
  test: {
    // Forks keep each PGlite instance in its own process; the cap stops several
    // WebAssembly Postgres instances from running at once.
    pool: 'forks',
    maxWorkers: 2,
    reporters,
    slowTestThreshold: 5_000,
    projects: [
      {
        resolve: sharedResolve,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: [fileTiming],
        },
      },
      {
        plugins: [react()],
        resolve: sharedResolve,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/setup/ui.setup.ts', fileTiming],
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          exclude: ['tests/integration/migration/**'],
          setupFiles: [fileTiming, pgliteLifecycle],
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'migration',
          environment: 'node',
          include: ['tests/integration/migration/**/*.test.ts'],
          setupFiles: [fileTiming, pgliteLifecycle],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
