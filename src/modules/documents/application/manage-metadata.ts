import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { isDocumentCategory } from '../domain/categories';
import type { DocumentRecord } from '../domain/types';
import { findDocumentById, updateDocumentById } from '../data/documents.repository';
import { findDocumentFolderById } from '../data/folders.repository';
import { setDocumentMetadataSchema } from '../validation/schemas';

export async function setDocumentMetadata(
  context: OrgContext,
  rawInput: {
    documentId: string;
    category?: string | null;
    tags?: string | null;
    expiresAt?: string | null;
    isRequired?: boolean;
    requiredType?: string | null;
    folderId?: string | null;
  },
): Promise<DocumentRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = setDocumentMetadataSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  if (!existing || existing.status === 'deleted' || existing.deletedAt) {
    throw new NotFoundError('Document');
  }

  if (parsed.data.category && !isDocumentCategory(parsed.data.category)) {
    throw new ValidationError([{ path: 'category', message: 'Unknown category' }]);
  }

  if (parsed.data.folderId) {
    const folder = await findDocumentFolderById(
      context.db,
      context.organizationId,
      parsed.data.folderId,
    );
    if (!folder || folder.archivedAt) throw new NotFoundError('Folder');
  }

  const updated = await updateDocumentById(context.db, context.organizationId, existing.id, {
    ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    ...(parsed.data.expiresAt !== undefined ? { expiresAt: parsed.data.expiresAt } : {}),
    ...(parsed.data.isRequired !== undefined ? { isRequired: parsed.data.isRequired } : {}),
    ...(parsed.data.requiredType !== undefined ? { requiredType: parsed.data.requiredType } : {}),
    ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId } : {}),
  });

  if (!updated) throw new NotFoundError('Document');
  return updated;
}
