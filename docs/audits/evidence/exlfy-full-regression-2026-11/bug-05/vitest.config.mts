import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));
const nextNavigationStub = path.resolve(repoRoot, 'tests/setup/next-navigation-stub.ts');

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(repoRoot, 'src'),
      'next/navigation': nextNavigationStub,
      'next/navigation.js': nextNavigationStub,
    },
  },
  test: {
    name: 'exlfy-bug-05-fab',
    environment: 'node',
    root: repoRoot,
    include: ['docs/audits/evidence/exlfy-full-regression-2026-11/bug-05/**/*.test.ts'],
    setupFiles: [path.resolve(repoRoot, 'tests/setup/next-navigation-vitest.ts')],
  },
});
