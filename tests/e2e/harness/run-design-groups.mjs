/**
 * Runs the design Playwright files as separate processes.
 *
 * A single `next dev` that has compiled the engine routes does not finish
 * later authenticated navigations within the 45s sign-in wait. Signed-out
 * pages still return, workers stay at 1, and cookies are cleared per test.
 * Each group below starts a fresh harness. Exit non-zero if any group fails.
 * This file does not run `next build` and does not touch a remote database.
 */
import { spawnSync } from 'node:child_process';

const groups = [
  ['tests/e2e/design/design-a11y.spec.ts', 'tests/e2e/design/design-switch.spec.ts'],
  ['tests/e2e/design/design-finance.spec.ts', 'tests/e2e/design/design-route-coverage.spec.ts'],
  ['tests/e2e/design/design-contractor-matrix.spec.ts'],
  ['tests/e2e/design/design-engines.spec.ts'],
  ['tests/e2e/design/design-closeout.spec.ts'],
];

let failed = 0;
for (const args of groups) {
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--config=playwright.design.config.ts', ...args],
    { stdio: 'inherit', shell: true },
  );
  if (result.status !== 0) failed += 1;
}

process.exit(failed === 0 ? 0 : 1);
