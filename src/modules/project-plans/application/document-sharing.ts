import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ProjectFileDeps } from '@/modules/evidence';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { AuthorizationError, ConflictError, NotFoundError } from '@/shared/errors';
import {
  findProjectAgreement,
  findShareableProjectDocument,
  listProjectAgreements,
  listProjectPrincipals,
  listShareableProjectDocuments,
  type ShareableDocument,
} from '../data/audience.repository';
import {
  findActiveShareForTarget,
  findDocumentShare,
  insertDocumentShare,
  listDocumentSharesForProject,
  revokeDocumentShareRow,
} from '../data/shares.repository';
import { normalizeShareNote, normalizeShareTarget, normalizeShareTitle } from '../domain/sharing';
import { DOCUMENT_SHARE_AUDIENCES, type ContractorAudienceOptions, type DocumentShareView } from '../domain/types';
import { parseOrThrow, uuid } from './shared';

const shareSchema = z.object({
  projectId: uuid,
  documentId: uuid,
  audience: z.enum(DOCUMENT_SHARE_AUDIENCES),
  agreementId: uuid.nullish(),
  principalId: uuid.nullish(),
  title: z.string().max(400).nullish(),
  note: z.string().max(4000).nullish(),
  acknowledgementRequired: z.boolean().default(false),
});

/**
 * Shares an existing project document with contractors. Metadata only: the `documents` row and the
 * provider file are never copied; contractors read it through the share (RLS) + file route.
 */
export async function shareDocumentWithContractors(
  context: OrgContext,
  raw: z.input<typeof shareSchema>,
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<{ shareId: string }> {
  const input = parseOrThrow(shareSchema, raw);
  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.DOCUMENTS_SHARE);
  const target = normalizeShareTarget(input);
  if (!target) throw new NotFoundError('Share target');

  const resolved = await deps.elevated(async (db) => {
    const document = await findShareableProjectDocument(db, context.organizationId, input.projectId, input.documentId);
    if (!document) throw new NotFoundError('Document');
    if (target.audience === 'agreement') {
      const agreement = await findProjectAgreement(db, context.organizationId, input.projectId, target.agreementId);
      if (!agreement) throw new NotFoundError('Agreement');
      return { document, vendorId: agreement.vendorId, agreementId: agreement.id, principalId: null };
    }
    if (target.audience === 'principal') {
      const principal = (await listProjectPrincipals(db, context.organizationId, input.projectId)).find(
        (candidate) => candidate.id === target.principalId,
      );
      if (!principal) throw new NotFoundError('Contractor user');
      return { document, vendorId: principal.vendorId, agreementId: null, principalId: principal.id };
    }
    return { document, vendorId: null, agreementId: null, principalId: null };
  });

  if (
    await findActiveShareForTarget(context.db, {
      organizationId: context.organizationId,
      documentId: input.documentId,
      audience: target.audience,
      subcontractAgreementId: resolved.agreementId,
      principalId: resolved.principalId,
    })
  ) {
    throw new ConflictError('Already shared with this audience', 'projectPlans.sharing.errors.alreadyShared');
  }

  const shareId = randomUUID();
  await insertDocumentShare(context.db, {
    id: shareId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    documentId: input.documentId,
    audience: target.audience,
    vendorId: resolved.vendorId,
    subcontractAgreementId: resolved.agreementId,
    principalId: resolved.principalId,
    title: normalizeShareTitle(input.title, resolved.document.fileName),
    fileName: resolved.document.fileName,
    mimeType: resolved.document.mimeType,
    sizeBytes: resolved.document.sizeBytes,
    note: normalizeShareNote(input.note),
    acknowledgementRequired: input.acknowledgementRequired,
    sharedByUserId: context.userId,
  });
  const facts = {
    shareId,
    documentId: input.documentId,
    audience: target.audience,
    vendorId: resolved.vendorId,
    subcontractAgreementId: resolved.agreementId,
    principalId: resolved.principalId,
    acknowledgementRequired: input.acknowledgementRequired,
  };
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.DOCUMENT_SHARED,
    entityType: 'shared_document',
    entityId: shareId,
    actor: internalActor(context.userId),
    payload: facts,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_SHARE_CREATED,
    entityType: 'shared_document',
    entityId: shareId,
    after: facts,
  });
  return { shareId };
}

export async function revokeDocumentShare(context: OrgContext, shareId: string): Promise<void> {
  const share = await findDocumentShare(context.db, context.organizationId, uuid.parse(shareId));
  if (!share) throw new NotFoundError('Share');
  await assertProjectCapability(context, share.projectId, PROJECT_CAPABILITIES.DOCUMENTS_SHARE);
  if (share.revokedAt) return;
  await revokeDocumentShareRow(context.db, context.organizationId, share.id, context.userId);
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: share.projectId,
    type: DOMAIN_EVENTS.DOCUMENT_SHARE_REVOKED,
    entityType: 'shared_document',
    entityId: share.id,
    actor: internalActor(context.userId),
    payload: { shareId: share.id, documentId: share.documentId, audience: share.audience },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DOCUMENT_SHARE_REVOKED,
    entityType: 'shared_document',
    entityId: share.id,
    before: { revokedAt: null },
    after: { revokedAt: new Date().toISOString() },
  });
}

export interface ProjectSharingPanelData {
  readonly shares: readonly DocumentShareView[];
  readonly canShare: boolean;
  readonly documents: readonly ShareableDocument[];
  readonly audienceOptions: ContractorAudienceOptions | null;
}

export async function loadProjectSharingPanel(
  context: OrgContext,
  input: { readonly projectId: string; readonly includeRevoked?: boolean },
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<ProjectSharingPanelData> {
  const projectId = uuid.parse(input.projectId);
  const capabilities = await loadProjectCapabilities(context, projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_VIEW)) {
    throw new AuthorizationError(`project:${PROJECT_CAPABILITIES.DOCUMENTS_VIEW}`);
  }
  const canShare = capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_SHARE);
  const shares = await listDocumentSharesForProject(context.db, {
    organizationId: context.organizationId,
    projectId,
    includeRevoked: input.includeRevoked,
  });
  if (!canShare) return { shares, canShare, documents: [], audienceOptions: null };
  const extras = await deps.elevated(async (db) => ({
    documents: await listShareableProjectDocuments(db, context.organizationId, projectId),
    audienceOptions: {
      agreements: await listProjectAgreements(db, context.organizationId, projectId),
      principals: await listProjectPrincipals(db, context.organizationId, projectId),
    },
  }));
  return { shares, canShare, ...extras };
}
