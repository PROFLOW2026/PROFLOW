import { and, eq } from 'drizzle-orm';
import { documents } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Read `documents.current_version_id` without rewriting the documents module.
 * Missing column, dummy test db, or lookup failure → null (job still queues).
 */
export async function lookupDocumentCurrentVersionId(
  db: DbExecutor | null | undefined,
  organizationId: string,
  documentId: string,
): Promise<string | null> {
  if (!db || typeof (db as { select?: unknown }).select !== 'function') {
    return null;
  }
  try {
    const [row] = await db
      .select({ currentVersionId: documents.currentVersionId })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
      .limit(1);
    return row?.currentVersionId ?? null;
  } catch {
    return null;
  }
}
