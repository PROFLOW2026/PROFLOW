/**
 * Idempotent bootstrap for Material Market Monitor V1.
 * Seeds source registry, fetches free historical observations, computes snapshots.
 *
 * Requires migration 0132 applied. Uses admin DB connection.
 *
 * npx tsx scripts/material-market-bootstrap.ts
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require.cache[require.resolve('server-only')] = {
  id: require.resolve('server-only'),
  filename: require.resolve('server-only'),
  loaded: true,
  exports: {},
} as NodeModule;

import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const { runMaterialMarketRefresh } = await import(
    '../src/modules/material-market/application/refresh-material-market.ts'
  );
  console.log('[material-market] starting bootstrap / full refresh…');
  const result = await runMaterialMarketRefresh();
  console.log('[material-market] complete', JSON.stringify(result, null, 2));
  if (result.errors.length > 0) {
    console.warn('[material-market] non-fatal source errors:', result.errors);
  }
}

main().catch((error) => {
  console.error('[material-market] failed', error);
  process.exit(1);
});
