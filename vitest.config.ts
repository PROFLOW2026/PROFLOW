import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const serverOnlyStub = path.resolve(rootDir, 'tests/setup/server-only-stub.ts');

const sharedResolve = {
  tsconfigPaths: true as const,
  alias: {
    // Production still throws if a client bundle imports real `server-only`.
    'server-only': serverOnlyStub,
  },
};

export default defineConfig({
  resolve: sharedResolve,
  test: {
    // Forks keep each PGlite instance in its own process; the cap stops several
    // WebAssembly Postgres instances from running at once.
    pool: 'forks',
    maxWorkers: 2,
    projects: [
      {
        resolve: sharedResolve,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: sharedResolve,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/setup/ui.setup.ts'],
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
