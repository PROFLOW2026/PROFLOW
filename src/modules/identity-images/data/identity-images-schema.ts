/**
 * Runtime probe for migration 0193 identity profile image columns.
 * Production may lag Owner SQL apply; feature UI gates on readiness.
 */

import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow } from '@/modules/financials';

let cachedReady: boolean | null = null;
let probeInFlight: Promise<boolean> | null = null;
let readyOverride: boolean | undefined;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function setIdentityImagesSchemaReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setIdentityImagesSchemaReadyForTests is test-only');
  }
  readyOverride = ready;
  cachedReady = ready ?? null;
  probeInFlight = null;
}

export async function isIdentityImagesSchemaReady(db: DbExecutor): Promise<boolean> {
  if (readyOverride !== undefined) return readyOverride;
  if (cachedReady !== null) return cachedReady;
  if (!probeInFlight) {
    probeInFlight = (async () => {
      try {
        const row = sqlFirstRow<{ present: boolean }>(
          await db.execute(sql`
            select exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'employees'
                and column_name = 'avatar_image_key'
            ) as present
          `),
        );
        cachedReady = Boolean(row?.present);
      } catch {
        cachedReady = false;
      }
      return cachedReady;
    })();
  }
  return probeInFlight;
}
