/**
 * Waits for harness auth health before starting Next (avoids app ready before PGlite seed).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTH_HEALTH = process.env.E2E_AUTH_HEALTH_URL ?? 'http://127.0.0.1:55321/health';
const MAX_WAIT_MS = Number(process.env.E2E_HARNESS_WAIT_MS ?? 240_000);
const SETTLE_MS = Number(process.env.E2E_HARNESS_SETTLE_MS ?? 3_000);

async function waitForHarness() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(AUTH_HEALTH, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        console.log('[e2e] harness auth healthy, starting app…');
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Harness auth not ready within ${MAX_WAIT_MS}ms (${AUTH_HEALTH})`);
}

await waitForHarness();

const startScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'start-app-for-playwright.mjs');
const child = spawn(process.execPath, [startScript], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
