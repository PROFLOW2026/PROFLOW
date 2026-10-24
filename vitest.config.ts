import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const cpuCount = typeof os.availableParallelism === 'function'
  ? os.availableParallelism()
  : os.cpus().length;
const unitWorkers = Math.max(1, Math.min(4, cpuCount));
const serverOnlyStub = path.resolve(rootDir, 'tests/setup/server-only-stub.ts');
const nextNavigationStub = path.resolve(rootDir, 'tests/setup/next-navigation-stub.ts');
const nextIntlNavigationStub = path.resolve(rootDir, 'tests/setup/next-intl-navigation-stub.ts');

function nextNavigationStubPlugin(): Plugin {
  return {
    name: 'vitest-next-navigation-stub',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'next-intl/navigation') {
        return nextIntlNavigationStub;
      }
      if (source === 'next/navigation' || source === 'next/navigation.js') {
        return nextNavigationStub;
      }
      return null;
    },
  };
}

const sharedNodePlugins = [nextNavigationStubPlugin()];
const fileTiming = path.resolve(rootDir, 'tests/setup/file-timing.ts');
const pgliteLifecycle = path.resolve(rootDir, 'tests/setup/pglite-lifecycle.ts');

const sharedResolve = {
  tsconfigPaths: true as const,
  alias: {
    // Production still throws if a client bundle imports real `server-only`.
    'server-only': serverOnlyStub,
    // next-intl/navigation → next/navigation; stub the entry so Node tests never resolve Next's CJS subpath.
    'next-intl/navigation': nextIntlNavigationStub,
    'next/navigation': nextNavigationStub,
    'next/navigation.js': nextNavigationStub,
  },
};

const nodeTestSetup = [
  path.resolve(rootDir, 'tests/setup/next-navigation-vitest.ts'),
  fileTiming,
];

const reporters = process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'];

export default defineConfig({
  plugins: sharedNodePlugins,
  resolve: sharedResolve,
  ssr: {
    // Apply resolve.alias when next-intl pulls in next/navigation during Node test imports.
    noExternal: ['next-intl'],
  },
  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    // Forks keep each PGlite instance in its own process. The default cap is
    // for database projects; the unit and UI projects raise it below.
    pool: 'forks',
    maxWorkers: 2,
    reporters,
    slowTestThreshold: 5_000,
    projects: [
      {
        plugins: sharedNodePlugins,
        resolve: sharedResolve,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'src/modules/**/__tests__/**/*.test.ts'],
          // Explicit local regressions (private DWG fixtures); run by path, not in CI unit gate.
          exclude: [
            'tests/unit/**/*.local.test.ts',
            // The push workflow runs this script directly. The test only shells out to it.
            'tests/unit/scripts/cad-licensing-denylist.test.ts',
          ],
          maxWorkers: unitWorkers,
          setupFiles: nodeTestSetup,
        },
      },
      {
        plugins: [react(), ...sharedNodePlugins],
        resolve: sharedResolve,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
          maxWorkers: unitWorkers,
          setupFiles: ['./tests/setup/ui.setup.ts', fileTiming],
        },
      },
      {
        plugins: sharedNodePlugins,
        resolve: sharedResolve,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          exclude: ['tests/integration/migration/**'],
          setupFiles: [...nodeTestSetup, pgliteLifecycle],
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
      {
        plugins: sharedNodePlugins,
        resolve: sharedResolve,
        test: {
          name: 'migration',
          environment: 'node',
          include: ['tests/integration/migration/**/*.test.ts'],
          setupFiles: [...nodeTestSetup, pgliteLifecycle],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
