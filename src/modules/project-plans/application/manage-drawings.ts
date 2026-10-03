import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  EVIDENCE_SIZE_LIMITS,
  checkEvidenceFile,
  contentMatchesMime,
  createPendingProjectDocument,
  markProjectDocumentStored,
  type ProjectFileDeps,
} from '@/modules/evidence';
import { PROJECT_CAPABILITIES, assertProjectCapability } from '@/modules/project-team';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { findProjectAgreement, findShareableProjectDocument, listProjectPrincipals } from '../data/audience.repository';
import {
  deleteDistributionEntries,
  findDrawing,
  findDrawingByNumber,
  findRevision,
  insertDistributionEntry,
  insertDrawing,
  insertRevision,
  listDistribution,
  listRevisions,
  updateDrawingRow,
  updateRevisionRow,
  type DrawingRevisionRow,
  type DrawingRow,
} from '../data/plans.repository';
import { normalizeRevisionLabel, nextRevisionSequence, planRevisionPublish, type PublishRejection } from '../domain/revisions';
import { diffDistribution } from '../domain/sharing';
import {
  DRAWING_CONTRACTOR_VISIBILITIES,
  DRAWING_DISCIPLINES,
  type DistributionEntryInput,
} from '../domain/types';
import { parseOrThrow, uuid } from './shared';

const SHARE = PROJECT_CAPABILITIES.DOCUMENTS_SHARE;

export const DRAWING_REVISION_UPLOAD_PATH = '/api/dg-files/upload/drawing-revision';

const drawingNumber = z.string().trim().min(1).max(64);
const title = z.string().trim().min(1).max(200);

const createSchema = z.object({
  projectId: uuid,
  drawingNumber,
  title,
  discipline: z.enum(DRAWING_DISCIPLINES),
  locationId: uuid.nullish(),
  contractorVisibility: z.enum(DRAWING_CONTRACTOR_VISIBILITIES).default('internal'),
});

async function loadDrawingForWrite(context: OrgContext, drawingId: string): Promise<DrawingRow> {
  const drawing = await findDrawing(context.db, context.organizationId, uuid.parse(drawingId));
  if (!drawing) throw new NotFoundError('Drawing');
  await assertProjectCapability(context, drawing.projectId, SHARE);
  return drawing;
}

export async function createDrawing(
  context: OrgContext,
  raw: z.input<typeof createSchema>,
): Promise<{ drawingId: string }> {
  const input = parseOrThrow(createSchema, raw);
  await assertProjectCapability(context, input.projectId, SHARE);
  if (await findDrawingByNumber(context.db, context.organizationId, input.projectId, input.drawingNumber)) {
    throw new ConflictError('Drawing number already exists', 'projectPlans.errors.numberTaken');
  }
  const drawingId = randomUUID();
  await insertDrawing(context.db, {
    id: drawingId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    drawingNumber: input.drawingNumber,
    title: input.title,
    discipline: input.discipline,
    locationId: input.locationId ?? null,
    contractorVisibility: input.contractorVisibility,
    createdByUserId: context.userId,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.PLAN_DRAWING_CREATED,
    entityType: 'drawing',
    entityId: drawingId,
    actor: internalActor(context.userId),
    payload: { drawingId, drawingNumber: input.drawingNumber, discipline: input.discipline },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_CREATED,
    entityType: 'drawing',
    entityId: drawingId,
    after: { ...input },
  });
  return { drawingId };
}

const updateSchema = z.object({
  drawingId: uuid,
  title: title.optional(),
  discipline: z.enum(DRAWING_DISCIPLINES).optional(),
  locationId: uuid.nullish(),
  contractorVisibility: z.enum(DRAWING_CONTRACTOR_VISIBILITIES).optional(),
});

export async function updateDrawing(context: OrgContext, raw: z.input<typeof updateSchema>): Promise<void> {
  const input = parseOrThrow(updateSchema, raw);
  const drawing = await loadDrawingForWrite(context, input.drawingId);
  if (drawing.status !== 'active') {
    throw new DomainRuleError('Drawing is archived', 'projectPlans.errors.archived');
  }
  const patch = {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.discipline === undefined ? {} : { discipline: input.discipline }),
    ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
    ...(input.contractorVisibility === undefined ? {} : { contractorVisibility: input.contractorVisibility }),
  };
  if (Object.keys(patch).length === 0) return;
  await updateDrawingRow(context.db, context.organizationId, drawing.id, patch);
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_UPDATED,
    entityType: 'drawing',
    entityId: drawing.id,
    before: {
      title: drawing.title,
      discipline: drawing.discipline,
      locationId: drawing.locationId,
      contractorVisibility: drawing.contractorVisibility,
    },
    after: patch,
  });
}

export async function archiveDrawing(context: OrgContext, drawingId: string): Promise<void> {
  const drawing = await loadDrawingForWrite(context, drawingId);
  if (drawing.status === 'archived') return;
  await updateDrawingRow(context.db, context.organizationId, drawing.id, { status: 'archived', archivedAt: new Date() });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_ARCHIVED,
    entityType: 'drawing',
    entityId: drawing.id,
    before: { status: drawing.status },
    after: { status: 'archived' },
  });
}

const distributionSchema = z.object({
  drawingId: uuid,
  entries: z
    .array(
      z.discriminatedUnion('audience', [
        z.object({ audience: z.literal('agreement'), agreementId: uuid }),
        z.object({ audience: z.literal('principal'), principalId: uuid }),
      ]),
    )
    .max(200),
});

/** Replaces the distribution list. Every agreement must belong to the drawing's project; every principal must hold a contractor grant reaching it. */
export async function setDrawingDistribution(
  context: OrgContext,
  raw: z.input<typeof distributionSchema>,
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<void> {
  const input = parseOrThrow(distributionSchema, raw);
  const drawing = await loadDrawingForWrite(context, input.drawingId);
  const current = await listDistribution(context.db, context.organizationId, drawing.id);
  const currentInputs = current.map((entry) =>
    entry.audience === 'agreement'
      ? { id: entry.id, audience: 'agreement' as const, agreementId: entry.agreementId! }
      : { id: entry.id, audience: 'principal' as const, principalId: entry.principalId! },
  );
  const { add, removeIds } = diffDistribution(currentInputs, input.entries as DistributionEntryInput[]);

  const resolved = await deps.elevated(async (db) => {
    const principals = add.some((entry) => entry.audience === 'principal')
      ? await listProjectPrincipals(db, context.organizationId, drawing.projectId)
      : [];
    const rows: { audience: 'agreement' | 'principal'; vendorId: string | null; agreementId: string | null; principalId: string | null }[] = [];
    for (const entry of add) {
      if (entry.audience === 'agreement') {
        const agreement = await findProjectAgreement(db, context.organizationId, drawing.projectId, entry.agreementId);
        if (!agreement) throw new NotFoundError('Agreement');
        rows.push({ audience: 'agreement', vendorId: agreement.vendorId, agreementId: agreement.id, principalId: null });
      } else {
        const principal = principals.find((candidate) => candidate.id === entry.principalId);
        if (!principal) throw new NotFoundError('Contractor user');
        rows.push({ audience: 'principal', vendorId: principal.vendorId, agreementId: null, principalId: principal.id });
      }
    }
    return rows;
  });

  await deleteDistributionEntries(context.db, context.organizationId, drawing.id, removeIds);
  for (const row of resolved) {
    await insertDistributionEntry(context.db, {
      organizationId: context.organizationId,
      projectId: drawing.projectId,
      drawingId: drawing.id,
      audience: row.audience,
      vendorId: row.vendorId,
      subcontractAgreementId: row.agreementId,
      principalId: row.principalId,
      addedByUserId: context.userId,
    });
  }
  if (add.length === 0 && removeIds.length === 0) return;
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: drawing.projectId,
    type: DOMAIN_EVENTS.PLAN_DISTRIBUTION_UPDATED,
    entityType: 'drawing',
    entityId: drawing.id,
    actor: internalActor(context.userId),
    payload: {
      drawingId: drawing.id,
      added: resolved.map((row) => ({ audience: row.audience, agreementId: row.agreementId, principalId: row.principalId, vendorId: row.vendorId })),
      removedCount: removeIds.length,
    },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_DISTRIBUTION_UPDATED,
    entityType: 'drawing',
    entityId: drawing.id,
    after: { added: resolved.length, removed: removeIds.length },
  });
}

const revisionMeta = {
  drawingId: uuid,
  revisionLabel: z.string().trim().min(1).max(16),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  description: z.string().trim().max(2000).nullish(),
  acknowledgementRequired: z.boolean().default(true),
};

const beginRevisionSchema = z.object({
  ...revisionMeta,
  fileName: z.string().min(1).max(400),
  mimeType: z.string().max(200).nullish(),
  sizeBytes: z.number().int().positive(),
});

const fromDocumentSchema = z.object({ ...revisionMeta, documentId: uuid });

function assertDrawingFile(input: { fileName: string; mimeType?: string | null; sizeBytes: number }) {
  const file = checkEvidenceFile({ fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
  if (!file.ok) {
    const key =
      file.reason === 'too_large'
        ? 'projectPlans.evidence.errors.tooLarge'
        : file.reason === 'empty'
          ? 'projectPlans.evidence.errors.empty'
          : 'projectPlans.errors.drawingFileType';
    throw new DomainRuleError(`Drawing file rejected: ${file.reason}`, key);
  }
  if (file.mimeType !== 'application/pdf' && file.kind !== 'photo') {
    throw new DomainRuleError('Drawing must be a PDF or image', 'projectPlans.errors.drawingFileType');
  }
  return file;
}

async function prepareRevision(context: OrgContext, drawingId: string, label: string) {
  const drawing = await loadDrawingForWrite(context, drawingId);
  if (drawing.status !== 'active') throw new DomainRuleError('Drawing is archived', 'projectPlans.errors.archived');
  const revisions = await listRevisions(context.db, context.organizationId, drawing.id, { includeWithdrawn: true });
  const normalized = normalizeRevisionLabel(label);
  if (
    revisions.some(
      (revision) => revision.status !== 'withdrawn' && revision.revisionLabel.toLowerCase() === normalized.toLowerCase(),
    )
  ) {
    throw new ConflictError('Revision label exists', 'projectPlans.errors.revisionTaken');
  }
  return { drawing, label: normalized, sequence: nextRevisionSequence(revisions) };
}

/** Uploads a NEW file as a draft revision (bytes follow to the returned URL). */
export async function beginDrawingRevisionUpload(
  context: OrgContext,
  raw: z.input<typeof beginRevisionSchema>,
  deps: ProjectFileDeps,
): Promise<{ revisionId: string; documentId: string; uploadUrl: string; mimeType: string; fileName: string }> {
  const input = parseOrThrow(beginRevisionSchema, raw);
  const file = assertDrawingFile(input);
  const { drawing, label, sequence } = await prepareRevision(context, input.drawingId, input.revisionLabel);
  const connection = await deps.store.resolveConnection(context.organizationId);
  const documentId = randomUUID();
  const revisionId = randomUUID();
  await deps.elevated((db) =>
    createPendingProjectDocument(db, {
      documentId,
      organizationId: context.organizationId,
      connection,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: context.userId,
      owner: { type: 'project', id: drawing.projectId },
      label: 'drawing',
    }),
  );
  await insertRevision(context.db, {
    id: revisionId,
    organizationId: context.organizationId,
    projectId: drawing.projectId,
    drawingId: drawing.id,
    revisionLabel: label,
    sequence,
    issueDate: input.issueDate ?? null,
    description: input.description || null,
    documentId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: input.sizeBytes,
    fileReady: false,
    acknowledgementRequired: input.acknowledgementRequired,
    createdByUserId: context.userId,
  });
  return {
    revisionId,
    documentId,
    uploadUrl: `${DRAWING_REVISION_UPLOAD_PATH}/${revisionId}`,
    mimeType: file.mimeType,
    fileName: file.fileName,
  };
}

export async function completeDrawingRevisionUpload(
  context: OrgContext,
  input: { readonly revisionId: string; readonly contentType: string | null; readonly bytes: Uint8Array },
  deps: ProjectFileDeps,
): Promise<void> {
  const revision = await findRevision(context.db, context.organizationId, uuid.parse(input.revisionId));
  if (!revision) throw new NotFoundError('Revision');
  await assertProjectCapability(context, revision.projectId, SHARE);
  if (revision.status !== 'draft' || revision.fileReady) {
    throw new DomainRuleError('Revision is not awaiting upload', 'projectPlans.evidence.errors.notPending');
  }
  const contentType = (input.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (contentType && contentType !== revision.mimeType && contentType !== 'application/octet-stream') {
    throw new DomainRuleError('Content type mismatch', 'projectPlans.evidence.errors.contentMismatch');
  }
  if (input.bytes.length === 0) throw new DomainRuleError('Empty upload', 'projectPlans.evidence.errors.empty');
  const limit = revision.mimeType === 'application/pdf' ? EVIDENCE_SIZE_LIMITS.document : EVIDENCE_SIZE_LIMITS.photo;
  if (input.bytes.length > limit) throw new DomainRuleError('Upload too large', 'projectPlans.evidence.errors.tooLarge');
  if (!contentMatchesMime(input.bytes.subarray(0, 32), revision.mimeType)) {
    throw new DomainRuleError('Content does not match type', 'projectPlans.evidence.errors.contentMismatch');
  }
  const stored = await deps.store.put({
    organizationId: revision.organizationId,
    projectId: revision.projectId,
    documentId: revision.documentId,
    folder: 'plans',
    fileName: revision.fileName,
    mimeType: revision.mimeType,
    bytes: input.bytes,
  });
  await deps.elevated((db) =>
    markProjectDocumentStored(db, {
      organizationId: revision.organizationId,
      documentId: revision.documentId,
      fileName: revision.fileName,
      mimeType: revision.mimeType,
      stored,
      uploadedByUserId: context.userId,
    }),
  );
  await updateRevisionRow(context.db, revision.organizationId, revision.id, 'draft', {
    fileReady: true,
    sizeBytes: stored.sizeBytes,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_REVISION_UPLOADED,
    entityType: 'drawing_revision',
    entityId: revision.id,
    after: { drawingId: revision.drawingId, revisionLabel: revision.revisionLabel, fileName: revision.fileName },
  });
}

/** Creates a draft revision pointing at an EXISTING project document (no copy). */
export async function addDrawingRevisionFromDocument(
  context: OrgContext,
  raw: z.input<typeof fromDocumentSchema>,
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<{ revisionId: string }> {
  const input = parseOrThrow(fromDocumentSchema, raw);
  const { drawing, label, sequence } = await prepareRevision(context, input.drawingId, input.revisionLabel);
  const document = await deps.elevated((db) =>
    findShareableProjectDocument(db, context.organizationId, drawing.projectId, input.documentId),
  );
  if (!document) throw new NotFoundError('Document');
  assertDrawingFile({ fileName: document.fileName, mimeType: document.mimeType, sizeBytes: document.sizeBytes ?? 1 });
  const revisionId = randomUUID();
  await insertRevision(context.db, {
    id: revisionId,
    organizationId: context.organizationId,
    projectId: drawing.projectId,
    drawingId: drawing.id,
    revisionLabel: label,
    sequence,
    issueDate: input.issueDate ?? null,
    description: input.description || null,
    documentId: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    fileReady: true,
    acknowledgementRequired: input.acknowledgementRequired,
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_REVISION_UPLOADED,
    entityType: 'drawing_revision',
    entityId: revisionId,
    after: { drawingId: drawing.id, revisionLabel: label, documentId: document.id, reused: true },
  });
  return { revisionId };
}

const PUBLISH_ERRORS: Readonly<Record<PublishRejection, string>> = {
  not_found: 'errors.notFound',
  not_draft: 'projectPlans.errors.notDraft',
  file_not_ready: 'projectPlans.errors.fileNotReady',
  newer_published: 'projectPlans.errors.newerPublished',
};

/** Publishing Rev N supersedes the current revision (kept as history) and makes N current - atomically. */
export async function publishDrawingRevision(
  context: OrgContext,
  revisionId: string,
): Promise<{ revisionId: string; supersededRevisionId: string | null }> {
  const revision = await findRevision(context.db, context.organizationId, uuid.parse(revisionId));
  if (!revision) throw new NotFoundError('Revision');
  const drawing = await loadDrawingForWrite(context, revision.drawingId);
  if (drawing.status !== 'active') throw new DomainRuleError('Drawing is archived', 'projectPlans.errors.archived');
  const revisions = await listRevisions(context.db, context.organizationId, drawing.id, { includeWithdrawn: true });
  const plan = planRevisionPublish(revisions, revision.id);
  if (!plan.ok) {
    if (plan.reason === 'not_found') throw new NotFoundError('Revision');
    throw new DomainRuleError(`Cannot publish revision: ${plan.reason}`, PUBLISH_ERRORS[plan.reason]);
  }
  const now = new Date();
  if (plan.supersedeId) {
    const superseded = await updateRevisionRow(context.db, context.organizationId, plan.supersedeId, 'current', {
      status: 'superseded',
      supersededAt: now,
      supersededByRevisionId: revision.id,
    });
    if (!superseded) throw new ConflictError('Current revision changed', 'projectPlans.errors.concurrentPublish');
  }
  const published = await updateRevisionRow(context.db, context.organizationId, revision.id, 'draft', {
    status: 'current',
    publishedAt: now,
    publishedByUserId: context.userId,
    supersedesRevisionId: plan.supersedeId,
  });
  if (!published) throw new ConflictError('Revision changed', 'projectPlans.errors.concurrentPublish');
  await updateDrawingRow(context.db, context.organizationId, drawing.id, { currentRevisionId: revision.id });

  const superseded = plan.supersedeId ? revisions.find((candidate) => candidate.id === plan.supersedeId) : null;
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: drawing.projectId,
    type: DOMAIN_EVENTS.PLAN_REVISION_PUBLISHED,
    entityType: 'drawing_revision',
    entityId: revision.id,
    actor: internalActor(context.userId),
    payload: {
      drawingId: drawing.id,
      drawingNumber: drawing.drawingNumber,
      revisionId: revision.id,
      revisionLabel: revision.revisionLabel,
      supersededRevisionId: plan.supersedeId,
      supersededRevisionLabel: superseded?.revisionLabel ?? null,
      contractorVisibility: drawing.contractorVisibility,
      acknowledgementRequired: revision.acknowledgementRequired,
    },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_REVISION_PUBLISHED,
    entityType: 'drawing_revision',
    entityId: revision.id,
    before: { status: 'draft', currentRevisionId: drawing.currentRevisionId },
    after: { status: 'current', supersededRevisionId: plan.supersedeId },
  });
  return { revisionId: revision.id, supersededRevisionId: plan.supersedeId };
}

/** Withdraws a draft (never a published revision - published history is kept). */
export async function withdrawDrawingRevision(context: OrgContext, revisionId: string): Promise<void> {
  const revision: DrawingRevisionRow | null = await findRevision(context.db, context.organizationId, uuid.parse(revisionId));
  if (!revision) throw new NotFoundError('Revision');
  await assertProjectCapability(context, revision.projectId, SHARE);
  if (revision.status !== 'draft') throw new DomainRuleError('Only drafts can be withdrawn', 'projectPlans.errors.notDraft');
  await updateRevisionRow(context.db, context.organizationId, revision.id, 'draft', { status: 'withdrawn' });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DRAWING_REVISION_WITHDRAWN,
    entityType: 'drawing_revision',
    entityId: revision.id,
    before: { status: 'draft' },
    after: { status: 'withdrawn' },
  });
}
