/**
 * Capture real authenticated ProjectFlow screens for the public homepage.
 *
 * Usage (from repo root, after Playwright harness can boot):
 *   CAPTURE_MARKETING=1 npx playwright test --project=desktop-he-authenticated tests/e2e/authenticated/capture-marketing-screenshots.spec.ts
 */
import { spawn } from 'node:child_process';

if (!process.env.CAPTURE_MARKETING) {
  process.env.CAPTURE_MARKETING = '1';
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'playwright',
    'test',
    '--project=desktop-he-authenticated',
    'tests/e2e/authenticated/capture-marketing-screenshots.spec.ts',
  ],
  { stdio: 'inherit', env: process.env },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
