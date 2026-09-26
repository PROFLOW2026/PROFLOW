import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findCaptureDocumentMembership } from '../data/capture-documents.repository';
import { findCaptureById } from '../data/quick-capture.repository';

/**
 * Verify that a document belongs to the capture session junction for this org.
 * Rejects client-supplied document IDs that are not part of the session.
 */
export async function assertCaptureSessionDocument(
  context: OrgContext,
  captureId: string,
  documentId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const capture = await findCaptureById(context.db, context.organizationId, captureId);
  if (!capture) throw new NotFoundError('Quick capture');

  const membership = await findCaptureDocumentMembership(
    context.db,
    context.organizationId,
    captureId,
    documentId,
  );
  if (!membership) {
    throw new NotFoundError('Capture document');
  }
}
