import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getDocumentById, type DocumentOwnerType } from '@/modules/documents';
import type { ComplianceArtifactRecord } from '../domain/types';
import {
  findComplianceArtifactById,
  updateComplianceArtifactById,
} from '../data/compliance.repository';

/**
 * Resolve the document_links owner for a compliance artifact.
 * Uses the dedicated `compliance_artifact` owner type (migration 0013).
 */
export function resolveComplianceDocumentOwner(
  artifact: Pick<ComplianceArtifactRecord, 'id'>,
): { ownerType: DocumentOwnerType; ownerId: string } {
  return { ownerType: 'compliance_artifact', ownerId: artifact.id };
}

/**
 * Point the artifact at a documents row (compliance_artifacts.document_id FK).
 * Caller is responsible for also creating/maintaining document_links via the documents module.
 */
export async function attachDocumentToComplianceArtifact(
  context: OrgContext,
  input: { artifactId: string; documentId: string },
): Promise<ComplianceArtifactRecord> {
  assertPermission(context, PERMISSIONS.COMPLIANCE_MANAGE);
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  if (!input.artifactId || !input.documentId) {
    throw new ValidationError([{ path: 'documentId', message: 'Document is required' }]);
  }

  const existing = await findComplianceArtifactById(
    context.db,
    context.organizationId,
    input.artifactId,
  );
  if (!existing) throw new NotFoundError('Compliance artifact');
  assertSameOrganization(context, existing, 'Compliance artifact');

  const document = await getDocumentById(context, input.documentId);
  if (!document || document.status === 'deleted') throw new NotFoundError('Document');

  const updated = await updateComplianceArtifactById(
    context.db,
    context.organizationId,
    existing.id,
    { documentId: document.id },
  );
  if (!updated) throw new NotFoundError('Compliance artifact');
  return updated;
}
