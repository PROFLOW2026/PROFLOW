import { and, desc, eq } from 'drizzle-orm';
import { retentionReleases } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { RetentionSide, RetentionSourceType } from '../domain/retention';

export type RetentionReleaseRow = typeof retentionReleases.$inferSelect;

export async function insertRetentionRelease(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly side: RetentionSide;
    readonly sourceType: RetentionSourceType;
    readonly sourceId: string;
    readonly amount: string;
    readonly currency: string;
    readonly releasedOn: string;
    readonly notes: string | null;
    readonly createdByUserId: string | null;
  },
): Promise<RetentionReleaseRow> {
  const [row] = await db.insert(retentionReleases).values(values).returning();
  if (!row) throw new Error('Failed to insert retention release');
  return row;
}

export async function listRetentionReleasesForSource(
  db: DbExecutor,
  organizationId: string,
  sourceType: RetentionSourceType,
  sourceId: string,
): Promise<RetentionReleaseRow[]> {
  return db
    .select()
    .from(retentionReleases)
    .where(
      and(
        eq(retentionReleases.organizationId, organizationId),
        eq(retentionReleases.sourceType, sourceType),
        eq(retentionReleases.sourceId, sourceId),
      ),
    )
    .orderBy(desc(retentionReleases.releasedOn), desc(retentionReleases.createdAt));
}
