import path from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';

/**
 * Per-file start/end logs so a CI hang names the stuck file.
 */
let started = 0;
let label = 'suite';

function currentFileLabel(): string {
  const state = expect.getState() as { filepath?: string; testPath?: string };
  const file = state.filepath ?? state.testPath;
  if (!file) return label;
  return path.relative(process.cwd(), file).replaceAll('\\', '/');
}

beforeAll(() => {
  started = Date.now();
  label = currentFileLabel();
  console.info(`[vitest] START ${label}`);
});

afterAll(() => {
  console.info(`[vitest] END ${currentFileLabel() || label} ${Date.now() - started}ms`);
});
