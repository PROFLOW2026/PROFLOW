/**
 * Audit harness prep: drop Next data cache so fixed E2E userIds do not keep
 * stale session-db snapshots across DB reseeds (new org UUIDs, same user ids).
 */
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
  const cacheDir = path.join(repoRoot, '.next', 'cache');

  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
    console.log(`[portal-harness] cleared ${cacheDir}`);
  } else {
    console.log('[portal-harness] no .next/cache to clear');
  }
}
