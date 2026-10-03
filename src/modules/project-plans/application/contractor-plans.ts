import { z } from 'zod';
import type { OpenedFile, ProjectFileDeps } from '@/modules/evidence';
import { externalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, writeAuditEvent } from '@/shared/audit';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, hasExternalScope, type ExternalContext } from '@/shared/external';
import {
  findDrawing,
  findVisibleRevision,
  insertRevisionAcknowledgement,
  listRevisions,
  listVisibleDrawingsWithCurrent,
  myRevisionAcknowledgements,
  toRevisionView,
} from '../data/plans.repository';
import {
  findVisibleDocumentShare,
  insertShareAcknowledgement,
  listDocumentSharesForProject,
  myShareAcknowledgements,
} from '../data/shares.repository';
import { acknowledgementPending } from '../domain/revisions';
import type { DrawingDiscipline, DrawingRevisionView } from '../domain/types';
import { requireExternalProjectCapability, uuid } from './shared';

const X = EXTERNAL_CAPABILITIES;

const projectInput = z.object({ organizationId: uuid, projectId: uuid });

function canOnProject(context: ExternalContext, organizationId: string, projectId: string, capability: typeof X[keyof typeof X]) {
  return context.grants.some(
    (grant) =>
      grant.organizationId === organizationId &&
      hasExternalScope(
        context,
        { organizationId, projectId, vendorId: grant.vendorId, subcontractAgreementId: grant.subcontractAgreementId },
        capability,
      ),
  );
}

export interface ContractorPlanItem {
  readonly drawingId: string;
  readonly drawingNumber: string;
  readonly title: string;
  readonly discipline: DrawingDiscipline;
  readonly locationName: string | null;
  readonly currentRevisionId: string;
  readonly revisionLabel: string;
  readonly issueDate: string | null;
  readonly publishedAt: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly acknowledgementRequired: boolean;
  readonly acknowledgedAt: string | null;
  readonly acknowledgementPending: boolean;
}

/** Drawings visible to this contractor on a project, each with its CURRENT revision only. */
export async function listContractorPlans(
  context: ExternalContext,
  raw: z.input<typeof projectInput>,
): Promise<{ items: readonly ContractorPlanItem[]; canAcknowledge: boolean }> {
  const input = projectInput.parse(raw);
  requireExternalProjectCapability(context, input, X.PLAN_VIEW);
  const rows = await listVisibleDrawingsWithCurrent(context.db, input);
  const acks = await myRevisionAcknowledgements(
    context.db,
    input.organizationId,
    context.principalId,
    rows.map((row) => row.currentRevisionId),
  );
  const items = rows.map((row) => {
    const acknowledgedAt = acks.get(row.currentRevisionId) ?? null;
    return {
      drawingId: row.id,
      drawingNumber: row.drawingNumber,
      title: row.title,
      discipline: row.discipline,
      locationName: row.locationName ?? null,
      currentRevisionId: row.currentRevisionId,
      revisionLabel: row.revisionLabel,
      issueDate: row.issueDate ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      fileName: row.fileName,
      mimeType: row.mimeType,
      acknowledgementRequired: row.acknowledgementRequired,
      acknowledgedAt,
      acknowledgementPending: acknowledgementPending({
        revisionStatus: 'current',
        acknowledgementRequired: row.acknowledgementRequired,
        acknowledgedByMe: acknowledgedAt !== null,
      }),
    };
  });
  return { items, canAcknowledge: canOnProject(context, input.organizationId, input.projectId, X.PLAN_ACKNOWLEDGE) };
}

export interface ContractorDrawingDetail {
  readonly drawing: {
    readonly id: string;
    readonly projectId: string;
    readonly drawingNumber: string;
    readonly title: string;
    readonly discipline: DrawingDiscipline;
    readonly currentRevisionId: string | null;
  };
  /** Published revisions newest first; superseded ones are history (clearly marked). */
  readonly revisions: readonly (DrawingRevisionView & { readonly acknowledgedAt: string | null })[];
  readonly canAcknowledge: boolean;
}

export async function getContractorDrawing(
  context: ExternalContext,
  raw: { readonly organizationId: string; readonly drawingId: string },
): Promise<ContractorDrawingDetail> {
  const organizationId = uuid.parse(raw.organizationId);
  const drawing = await findDrawing(context.db, organizationId, uuid.parse(raw.drawingId));
  if (!drawing) throw new NotFoundError('Drawing');
  requireExternalProjectCapability(context, { organizationId, projectId: drawing.projectId }, X.PLAN_VIEW);
  const revisions = await listRevisions(context.db, organizationId, drawing.id, { publishedOnly: true });
  const acks = await myRevisionAcknowledgements(
    context.db,
    organizationId,
    context.principalId,
    revisions.map((revision) => revision.id),
  );
  return {
    drawing: {
      id: drawing.id,
      projectId: drawing.projectId,
      drawingNumber: drawing.drawingNumber,
      title: drawing.title,
      discipline: drawing.discipline,
      currentRevisionId: drawing.currentRevisionId ?? null,
    },
    revisions: revisions.map((revision) => ({
      ...toRevisionView(revision),
      acknowledgedAt: acks.get(revision.id) ?? null,
    })),
    canAcknowledge: canOnProject(context, organizationId, drawing.projectId, X.PLAN_ACKNOWLEDGE),
  };
}

/** Contractor confirms it received the CURRENT revision. Idempotent; append-only. */
export async function acknowledgeDrawingRevision(
  context: ExternalContext,
  raw: { readonly organizationId: string; readonly revisionId: string },
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<{ acknowledged: boolean }> {
  const organizationId = uuid.parse(raw.organizationId);
  const revision = await findVisibleRevision(context.db, uuid.parse(raw.revisionId));
  if (!revision || revision.organizationId !== organizationId) throw new NotFoundError('Revision');
  if (revision.status !== 'current') {
    throw new DomainRuleError('Only the current revision can be acknowledged', 'projectPlans.errors.notCurrent');
  }
  const access = requireExternalProjectCapability(
    context,
    { organizationId, projectId: revision.projectId },
    X.PLAN_ACKNOWLEDGE,
  );
  const inserted = await insertRevisionAcknowledgement(context.db, {
    organizationId,
    projectId: revision.projectId,
    drawingId: revision.drawingId,
    revisionId: revision.id,
    principalId: context.principalId,
    vendorId: access.vendorId,
  });
  if (!inserted) return { acknowledged: false };
  const facts = {
    drawingId: revision.drawingId,
    revisionId: revision.id,
    revisionLabel: revision.revisionLabel,
    vendorId: access.vendorId,
  };
  await emitDomainEvent(context.db, {
    organizationId,
    projectId: revision.projectId,
    type: DOMAIN_EVENTS.PLAN_REVISION_ACKNOWLEDGED,
    entityType: 'drawing_revision',
    entityId: revision.id,
    actor: externalActor(context.principalId),
    payload: facts,
  });
  await deps.elevated((db) =>
    writeAuditEvent(db, {
      organizationId,
      actorUserId: null,
      action: AUDIT_ACTIONS.DRAWING_REVISION_ACKNOWLEDGED,
      entityType: 'drawing_revision',
      entityId: revision.id,
      after: facts,
      metadata: { actor: { type: 'external', principalId: context.principalId } },
    }),
  );
  return { acknowledged: true };
}

export async function openExternalRevisionFile(
  context: ExternalContext,
  input: { readonly revisionId: string; readonly rangeHeader?: string | null },
  deps: Pick<ProjectFileDeps, 'store'>,
): Promise<OpenedFile & { fileName: string }> {
  const revision = await findVisibleRevision(context.db, uuid.parse(input.revisionId));
  if (!revision || (revision.status !== 'current' && revision.status !== 'superseded')) {
    throw new NotFoundError('Revision');
  }
  requireExternalProjectCapability(
    context,
    { organizationId: revision.organizationId, projectId: revision.projectId },
    X.PLAN_VIEW,
  );
  const opened = await deps.store.open({
    organizationId: revision.organizationId,
    documentId: revision.documentId,
    rangeHeader: input.rangeHeader,
  });
  return { ...opened, mimeType: revision.mimeType, fileName: revision.fileName };
}

export interface ContractorSharedDocument {
  readonly shareId: string;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly note: string | null;
  readonly sharedAt: string;
  readonly acknowledgementRequired: boolean;
  readonly acknowledgedAt: string | null;
}

export async function listContractorSharedDocuments(
  context: ExternalContext,
  raw: z.input<typeof projectInput>,
): Promise<{ items: readonly ContractorSharedDocument[] }> {
  const input = projectInput.parse(raw);
  requireExternalProjectCapability(context, input, X.DOCUMENT_VIEW);
  const shares = await listDocumentSharesForProject(context.db, input);
  const acks = await myShareAcknowledgements(
    context.db,
    input.organizationId,
    context.principalId,
    shares.map((share) => share.id),
  );
  // Several shares can address the same document (project-wide + my agreement): show it once.
  const byDocument = new Map<string, ContractorSharedDocument>();
  for (const share of shares) {
    const existing = byDocument.get(share.documentId);
    const item: ContractorSharedDocument = {
      shareId: share.id,
      title: share.title,
      fileName: share.fileName,
      mimeType: share.mimeType,
      sizeBytes: share.sizeBytes,
      note: share.note,
      sharedAt: share.sharedAt,
      acknowledgementRequired: share.acknowledgementRequired,
      acknowledgedAt: acks.get(share.id) ?? null,
    };
    if (!existing || (item.acknowledgementRequired && !existing.acknowledgementRequired)) {
      byDocument.set(share.documentId, item);
    }
  }
  return { items: [...byDocument.values()] };
}

export async function acknowledgeSharedDocument(
  context: ExternalContext,
  raw: { readonly organizationId: string; readonly shareId: string },
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<{ acknowledged: boolean }> {
  const organizationId = uuid.parse(raw.organizationId);
  const share = await findVisibleDocumentShare(context.db, uuid.parse(raw.shareId));
  if (!share || share.organizationId !== organizationId || share.revokedAt) throw new NotFoundError('Share');
  const access = requireExternalProjectCapability(context, { organizationId, projectId: share.projectId }, X.DOCUMENT_VIEW);
  const inserted = await insertShareAcknowledgement(context.db, {
    organizationId,
    projectId: share.projectId,
    shareId: share.id,
    principalId: context.principalId,
    vendorId: access.vendorId,
  });
  if (!inserted) return { acknowledged: false };
  const facts = { shareId: share.id, documentId: share.documentId, vendorId: access.vendorId };
  await emitDomainEvent(context.db, {
    organizationId,
    projectId: share.projectId,
    type: DOMAIN_EVENTS.DOCUMENT_SHARE_ACKNOWLEDGED,
    entityType: 'shared_document',
    entityId: share.id,
    actor: externalActor(context.principalId),
    payload: facts,
  });
  await deps.elevated((db) =>
    writeAuditEvent(db, {
      organizationId,
      actorUserId: null,
      action: AUDIT_ACTIONS.DOCUMENT_SHARE_ACKNOWLEDGED,
      entityType: 'shared_document',
      entityId: share.id,
      after: facts,
      metadata: { actor: { type: 'external', principalId: context.principalId } },
    }),
  );
  return { acknowledged: true };
}

export async function openExternalSharedDocumentFile(
  context: ExternalContext,
  input: { readonly shareId: string; readonly rangeHeader?: string | null },
  deps: Pick<ProjectFileDeps, 'store'>,
): Promise<OpenedFile & { fileName: string }> {
  const share = await findVisibleDocumentShare(context.db, uuid.parse(input.shareId));
  if (!share || share.revokedAt) throw new NotFoundError('Share');
  requireExternalProjectCapability(
    context,
    { organizationId: share.organizationId, projectId: share.projectId },
    X.DOCUMENT_VIEW,
  );
  const opened = await deps.store.open({
    organizationId: share.organizationId,
    documentId: share.documentId,
    rangeHeader: input.rangeHeader,
  });
  return { ...opened, mimeType: share.mimeType, fileName: share.fileName };
}

export interface ContractorPlansPortalSummary {
  readonly canViewPlans: boolean;
  readonly canViewDocuments: boolean;
  readonly visibleDrawings: number;
  readonly plansAwaitingAcknowledgement: readonly Pick<
    ContractorPlanItem,
    'drawingId' | 'drawingNumber' | 'title' | 'currentRevisionId' | 'revisionLabel' | 'publishedAt'
  >[];
  /** Revisions published in the last `recentDays` days. */
  readonly recentRevisions: readonly Pick<
    ContractorPlanItem,
    'drawingId' | 'drawingNumber' | 'title' | 'currentRevisionId' | 'revisionLabel' | 'publishedAt'
  >[];
  readonly sharedDocuments: number;
  readonly documentsAwaitingAcknowledgement: readonly Pick<ContractorSharedDocument, 'shareId' | 'title' | 'sharedAt'>[];
}

/**
 * Portal dashboard summary (Track R composes it). Never throws for a missing capability -
 * returns empty sections so the dashboard renders only what the grant allows.
 */
export async function getContractorPlansPortalSummary(
  context: ExternalContext,
  raw: { readonly organizationId: string; readonly projectId: string; readonly recentDays?: number },
): Promise<ContractorPlansPortalSummary> {
  const input = projectInput.parse(raw);
  const canViewPlans = canOnProject(context, input.organizationId, input.projectId, X.PLAN_VIEW);
  const canViewDocuments = canOnProject(context, input.organizationId, input.projectId, X.DOCUMENT_VIEW);
  const since = Date.now() - (raw.recentDays ?? 14) * 24 * 60 * 60 * 1000;
  const plans = canViewPlans ? (await listContractorPlans(context, input)).items : [];
  const documents = canViewDocuments ? (await listContractorSharedDocuments(context, input)).items : [];
  const pick = (item: ContractorPlanItem) => ({
    drawingId: item.drawingId,
    drawingNumber: item.drawingNumber,
    title: item.title,
    currentRevisionId: item.currentRevisionId,
    revisionLabel: item.revisionLabel,
    publishedAt: item.publishedAt,
  });
  return {
    canViewPlans,
    canViewDocuments,
    visibleDrawings: plans.length,
    plansAwaitingAcknowledgement: plans.filter((item) => item.acknowledgementPending).map(pick),
    recentRevisions: plans
      .filter((item) => item.publishedAt && Date.parse(item.publishedAt) >= since)
      .map(pick),
    sharedDocuments: documents.length,
    documentsAwaitingAcknowledgement: documents
      .filter((item) => item.acknowledgementRequired && !item.acknowledgedAt)
      .map((item) => ({ shareId: item.shareId, title: item.title, sharedAt: item.sharedAt })),
  };
}
