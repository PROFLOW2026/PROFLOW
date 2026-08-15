import { linkDocumentToEntity } from '@/modules/documents';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { SAFETY_RECORD_DOCUMENT_OWNER } from '../domain/types';
import { findSafetyRecordById } from '../data/safety.repository';

export async function attachDocumentToSafetyRecord(
  context: OrgContext,
  input: { safetyRecordId: string; documentId: string; label?: string | null },
) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const record = await findSafetyRecordById(
    context.db,
    context.organizationId,
    input.safetyRecordId,
  );
  if (!record) throw new NotFoundError('Safety record');

  return linkDocumentToEntity(context, {
    documentId: input.documentId,
    ownerType: SAFETY_RECORD_DOCUMENT_OWNER,
    ownerId: record.id,
    label: input.label,
  });
}
