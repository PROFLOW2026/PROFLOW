import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS, recordAuditEvent, writeAuditEvent } from '@/shared/audit';
import { externalActor, internalActor } from '@/shared/actor';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { PROJECT_CAPABILITIES, hasProjectCapability } from '@/modules/project-team';
import {
  EVIDENCE_SIZE_LIMITS,
  checkEvidenceFile,
  contentMatchesMime,
  type EvidenceFileRejection,
} from '../domain/file-policy';
import type { EvidenceKind, EvidenceUploadTicket, EvidenceVisibility } from '../domain/types';
import { normalizeCaption, resolveEvidenceVisibility } from '../domain/visibility';
import {
  findEvidenceById,
  findVisibleEvidence,
  insertEvidence,
  markEvidenceAvailable,
  markEvidenceRemoved,
  type EvidenceRow,
} from '../data/evidence.repository';
import { authorizeExternalEntity, authorizeInternalEntity, type ProjectEntityScope } from './access';
import { createPendingProjectDocument, markProjectDocumentStored } from './document-records';
import type { ProjectFileDeps, ProjectFileFolder } from './file-store';

const beginSchema = z.object({
  entityType: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  entityId: z.string().uuid(),
  projectId: z.string().uuid().nullish(),
  fileName: z.string().min(1).max(400),
  mimeType: z.string().max(200).nullish(),
  sizeBytes: z.number().int().positive(),
  caption: z.string().max(2000).nullish(),
  visibility: z.enum(['internal', 'contractor']).nullish(),
  locationId: z.string().uuid().nullish(),
  accept: z.array(z.enum(['photo', 'video', 'document'])).max(3).nullish(),
});

export type BeginEvidenceUploadInput = z.input<typeof beginSchema>;
export type BeginExternalEvidenceUploadInput = BeginEvidenceUploadInput & { readonly organizationId: string };

export const INTERNAL_EVIDENCE_UPLOAD_PATH = '/api/dg-files/upload/evidence';
export const EXTERNAL_EVIDENCE_UPLOAD_PATH = '/api/contractor/dg-files/upload/evidence';

const REJECTION_KEYS: Readonly<Record<EvidenceFileRejection, string>> = {
  mime: 'projectPlans.evidence.errors.fileType',
  extension: 'projectPlans.evidence.errors.fileType',
  kind_not_accepted: 'projectPlans.evidence.errors.fileType',
  empty: 'projectPlans.evidence.errors.empty',
  too_large: 'projectPlans.evidence.errors.tooLarge',
};

function parseBegin(raw: BeginEvidenceUploadInput) {
  const parsed = beginSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const file = checkEvidenceFile({
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    accept: parsed.data.accept ?? undefined,
  });
  if (!file.ok) {
    throw new DomainRuleError(`Evidence file rejected: ${file.reason}`, REJECTION_KEYS[file.reason], {
      maxBytes: file.maxBytes,
    });
  }
  return { input: parsed.data, file };
}

export function evidenceFolderForKind(kind: EvidenceKind): ProjectFileFolder {
  return kind === 'document' ? 'general_files' : 'photos';
}

function documentOwner(scope: ProjectEntityScope, agreementId: string | null) {
  return agreementId
    ? ({ type: 'subcontract_agreement', id: agreementId } as const)
    : ({ type: 'project', id: scope.projectId } as const);
}

/** Step 1 (internal): authorize, validate, create the pending document + evidence row; returns the upload URL. */
export async function beginInternalEvidenceUpload(
  context: OrgContext,
  raw: BeginEvidenceUploadInput,
  deps: ProjectFileDeps,
): Promise<EvidenceUploadTicket> {
  const { input, file } = parseBegin(raw);
  const scope = await authorizeInternalEntity(context, {
    entityType: input.entityType,
    entityId: input.entityId,
    projectId: input.projectId,
  });
  const visibility = resolveEvidenceVisibility({
    uploader: 'internal',
    requested: input.visibility ?? null,
    entityInternalOnly: Boolean(scope.internalOnly),
  });
  if (!visibility.ok) {
    throw new DomainRuleError('Entity is internal only', 'projectPlans.evidence.errors.internalOnly');
  }

  const connection = await deps.store.resolveConnection(context.organizationId);
  const documentId = randomUUID();
  const evidenceId = randomUUID();
  const agreementId = scope.subcontractAgreementId ?? null;

  await deps.elevated((db) =>
    createPendingProjectDocument(db, {
      documentId,
      organizationId: context.organizationId,
      connection,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: context.userId,
      owner: documentOwner(scope, agreementId),
      label: 'evidence',
    }),
  );
  await insertEvidence(context.db, {
    id: evidenceId,
    organizationId: context.organizationId,
    projectId: scope.projectId,
    documentId,
    entityType: input.entityType,
    entityId: input.entityId,
    vendorId: scope.vendorId ?? null,
    subcontractAgreementId: agreementId,
    locationId: input.locationId ?? null,
    kind: file.kind,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: input.sizeBytes,
    caption: normalizeCaption(input.caption),
    visibility: visibility.visibility,
    uploadedByActorType: 'internal',
    uploadedByUserId: context.userId,
    uploadedByPrincipalId: null,
  });

  return {
    evidenceId,
    documentId,
    uploadUrl: `${INTERNAL_EVIDENCE_UPLOAD_PATH}/${evidenceId}`,
    fileName: file.fileName,
    mimeType: file.mimeType,
    kind: file.kind,
    maxBytes: file.maxBytes,
  };
}

/** Step 1 (contractor): grant must carry ext.document.upload for the entity's company / project. */
export async function beginExternalEvidenceUpload(
  context: ExternalContext,
  raw: BeginExternalEvidenceUploadInput,
  deps: ProjectFileDeps,
): Promise<EvidenceUploadTicket> {
  const organizationId = z.string().uuid().parse(raw.organizationId);
  const { input, file } = parseBegin(raw);
  const access = await authorizeExternalEntity(context, {
    organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    projectId: input.projectId,
    capability: EXTERNAL_CAPABILITIES.DOCUMENT_UPLOAD,
  });
  const visibility = resolveEvidenceVisibility({
    uploader: 'external',
    entityInternalOnly: Boolean(access.scope.internalOnly),
  });
  if (!visibility.ok) throw new NotFoundError('Entity');

  const connection = await deps.store.resolveConnection(organizationId);
  const documentId = randomUUID();
  const evidenceId = randomUUID();

  await deps.elevated((db) =>
    createPendingProjectDocument(db, {
      documentId,
      organizationId,
      connection,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: null,
      owner: documentOwner(access.scope, access.subcontractAgreementId),
      label: 'evidence',
    }),
  );
  await insertEvidence(context.db, {
    id: evidenceId,
    organizationId,
    projectId: access.scope.projectId,
    documentId,
    entityType: input.entityType,
    entityId: input.entityId,
    vendorId: access.vendorId,
    subcontractAgreementId: access.subcontractAgreementId,
    locationId: input.locationId ?? null,
    kind: file.kind,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: input.sizeBytes,
    caption: normalizeCaption(input.caption),
    visibility: 'contractor',
    uploadedByActorType: 'external',
    uploadedByUserId: null,
    uploadedByPrincipalId: context.principalId,
  });

  return {
    evidenceId,
    documentId,
    uploadUrl: `${EXTERNAL_EVIDENCE_UPLOAD_PATH}/${evidenceId}`,
    fileName: file.fileName,
    mimeType: file.mimeType,
    kind: file.kind,
    maxBytes: file.maxBytes,
  };
}

export interface CompleteEvidenceUploadInput {
  readonly evidenceId: string;
  readonly contentType: string | null;
  readonly bytes: Uint8Array;
}

function verifyBytes(row: EvidenceRow, input: CompleteEvidenceUploadInput): void {
  if (row.status !== 'pending') {
    throw new DomainRuleError('Evidence is not awaiting upload', 'projectPlans.evidence.errors.notPending');
  }
  const contentType = (input.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (contentType && contentType !== row.mimeType && contentType !== 'application/octet-stream') {
    throw new DomainRuleError('Content type mismatch', 'projectPlans.evidence.errors.contentMismatch');
  }
  if (input.bytes.length <= 0) {
    throw new DomainRuleError('Empty upload', 'projectPlans.evidence.errors.empty');
  }
  if (input.bytes.length > EVIDENCE_SIZE_LIMITS[row.kind]) {
    throw new DomainRuleError('Upload too large', 'projectPlans.evidence.errors.tooLarge');
  }
  if (!contentMatchesMime(input.bytes.subarray(0, 32), row.mimeType)) {
    throw new DomainRuleError('Content does not match type', 'projectPlans.evidence.errors.contentMismatch');
  }
}

function eventPayload(row: EvidenceRow, sizeBytes?: number) {
  return {
    evidenceId: row.id,
    documentId: row.documentId,
    entityType: row.entityType,
    entityId: row.entityId,
    kind: row.kind,
    visibility: row.visibility,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
  };
}

/** Step 2 (internal): store bytes in the org's provider, then flip document + evidence to available. */
export async function completeInternalEvidenceUpload(
  context: OrgContext,
  input: CompleteEvidenceUploadInput,
  deps: ProjectFileDeps,
): Promise<{ evidenceId: string }> {
  const row = await findEvidenceById(context.db, context.organizationId, input.evidenceId);
  if (!row || row.uploadedByActorType !== 'internal' || row.uploadedByUserId !== context.userId) {
    throw new NotFoundError('Evidence');
  }
  verifyBytes(row, input);

  const stored = await deps.store.put({
    organizationId: row.organizationId,
    projectId: row.projectId,
    documentId: row.documentId,
    folder: evidenceFolderForKind(row.kind),
    fileName: row.fileName,
    mimeType: row.mimeType,
    bytes: input.bytes,
  });
  await deps.elevated((db) =>
    markProjectDocumentStored(db, {
      organizationId: row.organizationId,
      documentId: row.documentId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      stored,
      uploadedByUserId: context.userId,
    }),
  );
  if (!(await markEvidenceAvailable(context.db, row.organizationId, row.id, stored.sizeBytes))) {
    throw new DomainRuleError('Evidence is not awaiting upload', 'projectPlans.evidence.errors.notPending');
  }
  await emitDomainEvent(context.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.EVIDENCE_UPLOADED,
    entityType: 'evidence',
    entityId: row.id,
    actor: internalActor(context.userId),
    payload: eventPayload(row, stored.sizeBytes),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EVIDENCE_UPLOADED,
    entityType: 'evidence',
    entityId: row.id,
    after: { ...eventPayload(row, stored.sizeBytes), fileName: row.fileName, projectId: row.projectId },
  });
  return { evidenceId: row.id };
}

/** Step 2 (contractor): only the uploading principal can complete; audit goes through the trusted writer. */
export async function completeExternalEvidenceUpload(
  context: ExternalContext,
  input: CompleteEvidenceUploadInput,
  deps: ProjectFileDeps,
): Promise<{ evidenceId: string }> {
  const row = await findVisibleEvidence(context.db, input.evidenceId);
  if (!row || row.uploadedByActorType !== 'external' || row.uploadedByPrincipalId !== context.principalId) {
    throw new NotFoundError('Evidence');
  }
  if (!context.grants.some((grant) => grant.organizationId === row.organizationId && grant.vendorId === row.vendorId)) {
    throw new NotFoundError('Evidence');
  }
  verifyBytes(row, input);

  const stored = await deps.store.put({
    organizationId: row.organizationId,
    projectId: row.projectId,
    documentId: row.documentId,
    folder: evidenceFolderForKind(row.kind),
    fileName: row.fileName,
    mimeType: row.mimeType,
    bytes: input.bytes,
  });
  await deps.elevated(async (db) => {
    await markProjectDocumentStored(db, {
      organizationId: row.organizationId,
      documentId: row.documentId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      stored,
      uploadedByUserId: null,
    });
    await writeAuditEvent(db, {
      organizationId: row.organizationId,
      actorUserId: null,
      action: AUDIT_ACTIONS.EVIDENCE_UPLOADED,
      entityType: 'evidence',
      entityId: row.id,
      after: { ...eventPayload(row, stored.sizeBytes), fileName: row.fileName, projectId: row.projectId },
      metadata: { actor: { type: 'external', principalId: context.principalId } },
    });
  });
  if (!(await markEvidenceAvailable(context.db, row.organizationId, row.id, stored.sizeBytes))) {
    throw new DomainRuleError('Evidence is not awaiting upload', 'projectPlans.evidence.errors.notPending');
  }
  await emitDomainEvent(context.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.EVIDENCE_UPLOADED,
    entityType: 'evidence',
    entityId: row.id,
    actor: externalActor(context.principalId),
    payload: eventPayload(row, stored.sizeBytes),
  });
  return { evidenceId: row.id };
}

/** Internal removal: the uploader, or anyone holding documents.share on the project. Bytes are kept for history. */
export async function removeInternalEvidence(
  context: OrgContext,
  evidenceId: string,
): Promise<void> {
  const row = await findEvidenceById(context.db, context.organizationId, evidenceId);
  if (!row || row.status === 'removed') throw new NotFoundError('Evidence');
  const isUploader = row.uploadedByActorType === 'internal' && row.uploadedByUserId === context.userId;
  if (!isUploader) {
    if (!(await hasProjectCapability(context, row.projectId, PROJECT_CAPABILITIES.DOCUMENTS_SHARE))) {
      throw new NotFoundError('Evidence');
    }
  }
  if (!(await markEvidenceRemoved(context.db, row.organizationId, row.id, { userId: context.userId, principalId: null }))) {
    throw new NotFoundError('Evidence');
  }
  await emitDomainEvent(context.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.EVIDENCE_REMOVED,
    entityType: 'evidence',
    entityId: row.id,
    actor: internalActor(context.userId),
    payload: eventPayload(row),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EVIDENCE_REMOVED,
    entityType: 'evidence',
    entityId: row.id,
    before: { status: row.status, fileName: row.fileName },
    after: { status: 'removed' },
  });
}

/** Contractor removal: only its own uploads, while the grant still allows uploading. */
export async function removeExternalEvidence(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly evidenceId: string },
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<void> {
  const row = await findEvidenceById(context.db, input.organizationId, input.evidenceId);
  if (
    !row ||
    row.status === 'removed' ||
    row.uploadedByActorType !== 'external' ||
    row.uploadedByPrincipalId !== context.principalId
  ) {
    throw new NotFoundError('Evidence');
  }
  if (!(await markEvidenceRemoved(context.db, row.organizationId, row.id, { userId: null, principalId: context.principalId }))) {
    throw new NotFoundError('Evidence');
  }
  await emitDomainEvent(context.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.EVIDENCE_REMOVED,
    entityType: 'evidence',
    entityId: row.id,
    actor: externalActor(context.principalId),
    payload: eventPayload(row),
  });
  await deps.elevated((db) =>
    writeAuditEvent(db, {
      organizationId: row.organizationId,
      actorUserId: null,
      action: AUDIT_ACTIONS.EVIDENCE_REMOVED,
      entityType: 'evidence',
      entityId: row.id,
      before: { status: row.status, fileName: row.fileName },
      after: { status: 'removed' },
      metadata: { actor: { type: 'external', principalId: context.principalId } },
    }),
  );
}

export type { EvidenceVisibility };
