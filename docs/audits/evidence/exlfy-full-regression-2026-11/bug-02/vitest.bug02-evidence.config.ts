import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const serverOnlyStub = path.resolve(rootDir, 'tests/setup/server-only-stub.ts');
const nextNavigationStub = path.resolve(rootDir, 'tests/setup/next-navigation-stub.ts');
const nextIntlNavigationStub = path.resolve(rootDir, 'tests/setup/next-intl-navigation-stub.ts');
const pgliteLifecycle = path.resolve(rootDir, 'tests/setup/pglite-lifecycle.ts');
const fileTiming = path.resolve(rootDir, 'tests/setup/file-timing.ts');

function nextNavigationStubPlugin(): Plugin {
  return {
    name: 'vitest-next-navigation-stub',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'next-intl/navigation') return nextIntlNavigationStub;
      if (source === 'next/navigation' || source === 'next/navigation.js') return nextNavigationStub;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [nextNavigationStubPlugin()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(rootDir, 'src'),
      '@drizzle': path.resolve(rootDir, 'drizzle'),
      '@tests': path.resolve(rootDir, 'tests'),
      'server-only': serverOnlyStub,
      'next-intl/navigation': nextIntlNavigationStub,
      'next/navigation': nextNavigationStub,
      'next/navigation.js': nextNavigationStub,
    },
  },
  test: {
    name: 'bug02-evidence',
    root: rootDir,
    include: ['docs/audits/evidence/exlfy-full-regression-2026-11/bug-02/**/*.test.ts'],
    environment: 'node',
    setupFiles: [
      path.resolve(rootDir, 'tests/setup/next-navigation-vitest.ts'),
      fileTiming,
      pgliteLifecycle,
    ],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
