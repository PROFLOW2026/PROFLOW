/**
 * Runtime probe for migration 0191 project cover columns.
 * Production may lag Gate B apply; omit columns from SELECT/UPDATE when absent.
 */

import { getTableColumns, sql } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow } from '@/modules/financials';

let cachedReady: boolean | null = null;
let probeInFlight: Promise<boolean> | null = null;
let readyOverride: boolean | undefined;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/** Test-only override — mirrors other schema gate helpers. */
export function setProjectCoverImageSchemaReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setProjectCoverImageSchemaReadyForTests is test-only');
  }
  readyOverride = ready;
  cachedReady = ready ?? null;
  probeInFlight = null;
}

export async function isProjectCoverImageSchemaReady(db: DbExecutor): Promise<boolean> {
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
                and table_name = 'projects'
                and column_name = 'cover_image_key'
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

const COVER_COLUMN_KEYS = [
  'coverImageKey',
  'coverImageContentType',
  'coverImageWidth',
  'coverImageHeight',
  'coverImageUpdatedAt',
  'coverImageUpdatedByUserId',
] as const;

/** Project table columns safe for the current database (0191 may be pending). */
export async function projectsSelectColumns(db: DbExecutor) {
  const cols = getTableColumns(projects);
  if (await isProjectCoverImageSchemaReady(db)) return cols;
  const rest = { ...cols };
  for (const key of COVER_COLUMN_KEYS) {
    delete rest[key];
  }
  return rest;
}
