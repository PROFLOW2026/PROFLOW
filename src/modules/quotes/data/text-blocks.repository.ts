import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { estimateTextBlocks, quoteDefaultTextBlocks } from '@drizzle/schema/next-gen';
import type { DbExecutor } from '@/shared/db/types';
import type {
  EstimateTextBlockRecord,
  QuoteDefaultTextBlockRecord,
} from '../domain/text-blocks';

function mapDefault(row: typeof quoteDefaultTextBlocks.$inferSelect): QuoteDefaultTextBlockRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    body: row.body,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    legacyKey: row.legacyKey,
  };
}

function mapEstimate(row: typeof estimateTextBlocks.$inferSelect): EstimateTextBlockRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    estimateId: row.estimateId,
    title: row.title,
    body: row.body,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    sourceDefaultBlockId: row.sourceDefaultBlockId,
  };
}

export async function listQuoteDefaultTextBlocks(
  db: DbExecutor,
  organizationId: string,
): Promise<readonly QuoteDefaultTextBlockRecord[]> {
  const rows = await db
    .select()
    .from(quoteDefaultTextBlocks)
    .where(eq(quoteDefaultTextBlocks.organizationId, organizationId))
    .orderBy(asc(quoteDefaultTextBlocks.sortOrder), asc(quoteDefaultTextBlocks.createdAt));
  return rows.map(mapDefault);
}

export async function insertQuoteDefaultTextBlock(
  db: DbExecutor,
  values: typeof quoteDefaultTextBlocks.$inferInsert,
): Promise<QuoteDefaultTextBlockRecord> {
  const [row] = await db.insert(quoteDefaultTextBlocks).values(values).returning();
  if (!row) throw new Error('insert failed');
  return mapDefault(row);
}

export async function updateQuoteDefaultTextBlock(
  db: DbExecutor,
  organizationId: string,
  blockId: string,
  patch: Partial<typeof quoteDefaultTextBlocks.$inferInsert>,
): Promise<QuoteDefaultTextBlockRecord | null> {
  const [row] = await db
    .update(quoteDefaultTextBlocks)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(quoteDefaultTextBlocks.id, blockId),
        eq(quoteDefaultTextBlocks.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapDefault(row) : null;
}

export async function deleteQuoteDefaultTextBlock(
  db: DbExecutor,
  organizationId: string,
  blockId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(quoteDefaultTextBlocks)
    .where(
      and(
        eq(quoteDefaultTextBlocks.id, blockId),
        eq(quoteDefaultTextBlocks.organizationId, organizationId),
      ),
    )
    .returning({ id: quoteDefaultTextBlocks.id });
  return deleted.length > 0;
}

export async function listEstimateTextBlocks(
  db: DbExecutor,
  organizationId: string,
  estimateId: string,
): Promise<readonly EstimateTextBlockRecord[]> {
  const rows = await db
    .select()
    .from(estimateTextBlocks)
    .where(
      and(
        eq(estimateTextBlocks.organizationId, organizationId),
        eq(estimateTextBlocks.estimateId, estimateId),
      ),
    )
    .orderBy(asc(estimateTextBlocks.sortOrder), asc(estimateTextBlocks.createdAt));
  return rows.map(mapEstimate);
}

export async function replaceEstimateTextBlocks(
  db: DbExecutor,
  organizationId: string,
  estimateId: string,
  blocks: ReadonlyArray<{
    title: string;
    body: string;
    enabled: boolean;
    sortOrder: number;
    sourceDefaultBlockId?: string | null;
  }>,
): Promise<void> {
  await db
    .delete(estimateTextBlocks)
    .where(
      and(
        eq(estimateTextBlocks.organizationId, organizationId),
        eq(estimateTextBlocks.estimateId, estimateId),
      ),
    );
  if (blocks.length === 0) return;
  await db.insert(estimateTextBlocks).values(
    blocks.map((block) => ({
      organizationId,
      estimateId,
      title: block.title,
      body: block.body,
      enabled: block.enabled,
      sortOrder: block.sortOrder,
      sourceDefaultBlockId: block.sourceDefaultBlockId ?? null,
    })),
  );
}

export async function copyDefaultBlocksToEstimate(
  db: DbExecutor,
  organizationId: string,
  estimateId: string,
): Promise<void> {
  const defaults = await listQuoteDefaultTextBlocks(db, organizationId);
  const enabled = defaults.filter((block) => block.enabled);
  if (enabled.length === 0) return;
  await replaceEstimateTextBlocks(
    db,
    organizationId,
    estimateId,
    enabled.map((block, index) => ({
      title: block.title,
      body: block.body,
      enabled: true,
      sortOrder: block.sortOrder ?? index,
      sourceDefaultBlockId: block.id,
    })),
  );
}
