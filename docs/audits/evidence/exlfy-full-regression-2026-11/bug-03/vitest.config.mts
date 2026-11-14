import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'exlfy-bug-03-pdf-scroll',
    environment: 'jsdom',
    root: repoRoot,
    include: ['docs/audits/evidence/exlfy-full-regression-2026-11/bug-03/**/*.test.ts'],
  },
});
