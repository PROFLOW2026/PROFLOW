import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { documents } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

const LEGACY_COUNT_LIMIT = 10_000;

/** Read-only count of rows still on supabase_legacy storage (M12-001 / O03). */
export async function countLegacyDocuments(db: DbExecutor): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.storageBackend, 'supabase_legacy'),
        isNull(documents.deletedAt),
        sql`${documents.status} <> 'deleted'`,
      ),
    )
    .limit(LEGACY_COUNT_LIMIT);
  return Math.min(Number(row?.count ?? 0), LEGACY_COUNT_LIMIT);
}
