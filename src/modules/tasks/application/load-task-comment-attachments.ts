import 'server-only';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { documentLinks, documents } from '@drizzle/schema';
import type { DocumentListItem } from '@/modules/documents/domain/types';
import type { DbExecutor } from '@/shared/db/types';

export type TaskCommentAttachmentRow = Pick<
  DocumentListItem,
  'id' | 'originalFilename' | 'mimeType' | 'sizeBytes' | 'status' | 'linkId' | 'label'
>;

/**
 * Batch-loads documents linked to task comments (document_links.owner_type = task_comment).
 */
export async function loadAttachmentsByCommentIds(
  db: DbExecutor,
  organizationId: string,
  commentIds: readonly string[],
): Promise<Map<string, TaskCommentAttachmentRow[]>> {
  const map = new Map<string, TaskCommentAttachmentRow[]>();
  if (commentIds.length === 0) return map;

  const rows = await db
    .select({
      commentId: documentLinks.ownerId,
      documentId: documents.id,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      status: documents.status,
      linkId: documentLinks.id,
      label: documentLinks.label,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documentLinks.documentId, documents.id))
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documentLinks.ownerType, 'task_comment'),
        inArray(documentLinks.ownerId, [...commentIds]),
        isNull(documents.deletedAt),
        sql`${documents.status} <> 'deleted'`,
      ),
    )
    .orderBy(documents.createdAt);

  for (const row of rows) {
    const list = map.get(row.commentId) ?? [];
    list.push({
      id: row.documentId,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      status: row.status,
      linkId: row.linkId,
      label: row.label,
    });
    map.set(row.commentId, list);
  }

  return map;
}
