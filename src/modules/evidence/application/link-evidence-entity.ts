import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import type { EvidenceKind, EvidenceVisibility } from '../domain/types';
import {
  findEvidenceById,
  insertEvidence,
  markEvidenceAvailable,
} from '../data/evidence.repository';

/**
 * Adds a second evidence_items row for the same stored document (no byte duplication).
 */
export async function linkEvidenceDocumentToEntity(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly sourceEvidenceId: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly uploadedByUserId: string;
  },
): Promise<{ readonly evidenceId: string }> {
  const source = await findEvidenceById(db, input.organizationId, input.sourceEvidenceId);
  if (!source || source.status !== 'available') throw new NotFoundError('Evidence');

  const evidenceId = randomUUID();
  await insertEvidence(db, {
    id: evidenceId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    documentId: source.documentId,
    entityType: input.entityType,
    entityId: input.entityId,
    vendorId: source.vendorId,
    subcontractAgreementId: source.subcontractAgreementId,
    locationId: source.locationId,
    kind: source.kind as EvidenceKind,
    fileName: source.fileName,
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    caption: source.caption,
    visibility: source.visibility as EvidenceVisibility,
    uploadedByActorType: 'internal',
    uploadedByUserId: input.uploadedByUserId,
    uploadedByPrincipalId: null,
  });
  const ok = await markEvidenceAvailable(db, input.organizationId, evidenceId, source.sizeBytes);
  if (!ok) throw new NotFoundError('Evidence');
  return { evidenceId };
}
