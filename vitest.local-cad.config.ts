import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Explicit local CAD regressions that need private DWG fixtures (not CI). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/local/**/*.test.ts'],
    setupFiles: [path.resolve(rootDir, 'tests/setup/file-timing.ts')],
    testTimeout: 130_000,
  },
});
