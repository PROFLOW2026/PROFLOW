import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { assertProjectCapability, loadProjectCapabilities, PROJECT_CAPABILITIES } from '@/modules/project-team';
import {
  assertProjectAssignee,
  fieldError,
  listProjectContractors,
  parseOrThrow,
  resolveAgreementVendor,
  vendorNameMap,
} from '@/modules/rfi';
import {
  availableSubmittalActions,
  isSubmittalOverdue,
  nextSubmittalStatus,
  reviewRequiresComments,
} from '../domain/lifecycle';
import {
  SUBMITTAL_CONTRACTOR_ACTION_STATUSES,
  SUBMITTAL_PENDING_STATUSES,
  type SubmittalAction,
  type SubmittalDetail,
  type SubmittalListItem,
  type SubmittalStatus,
  type SubmittalStatusCounts,
} from '../domain/types';
import {
  countOverdueSubmittalRows,
  countSubmittalsByStatus,
  findCurrentRevision,
  findSubmittalRow,
  insertReview,
  insertRevision,
  insertSubmittal,
  listSubmittalRows,
  loadSubmittalDetail,
  updateSubmittalRow,
  type SubmittalPatch,
  type SubmittalRow,
} from '../data/submittals.repository';
import {
  createInternalSubmittalSchema,
  listSubmittalsSchema,
  reviewSubmittalSchema,
  revisionNotesSchema,
  submittalActionSchema,
  updateInternalSubmittalSchema,
  type CreateInternalSubmittalInput,
  type ListSubmittalsInput,
  type ReviewSubmittalInput,
  type RevisionNotesInput,
  type SubmittalActionInput,
  type UpdateInternalSubmittalInput,
} from '../validation/schemas';
import {
  openRevisionCore,
  submitCore,
  SUBMITTAL_ENTITY,
  updateRevisionNotesCore,
  withdrawCore,
  type SubmittalRuntime,
} from './core';

const MANAGE = PROJECT_CAPABILITIES.SUBMITTAL_MANAGE;
const TERMINAL: readonly SubmittalStatus[] = ['approved', 'approved_with_comments', 'withdrawn'];

function internalRuntime(context: OrgContext): SubmittalRuntime {
  return {
    db: context.db,
    actor: internalActor(context.userId),
    actorType: 'internal',
    audit: (input) =>
      recordAuditEvent(context, {
        action: input.action,
        entityType: SUBMITTAL_ENTITY,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
        metadata: input.metadata,
      }),
  };
}

async function loadManaged(context: OrgContext, submittalId: string): Promise<SubmittalRow> {
  const row = await findSubmittalRow(context.db, context.organizationId, submittalId);
  if (!row || row.archivedAt) throw new NotFoundError('Submittal');
  await assertProjectCapability(context, row.projectId, MANAGE);
  return row;
}

/** Project team registers a submittal on behalf of a contractor (agreement required). */
export async function createSubmittal(
  context: OrgContext,
  raw: CreateInternalSubmittalInput,
): Promise<{ submittalId: string; number: number; revisionId: string }> {
  const input = parseOrThrow(createInternalSubmittalSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, MANAGE);
  const { vendorId, agreementId } = await resolveAgreementVendor(
    context.db,
    context.organizationId,
    input.projectId,
    input.subcontractAgreementId,
  );
  await assertProjectAssignee(context, input.projectId, input.reviewerUserId, 'reviewerUserId');

  return withTransaction(context.db, async (tx) => {
    const created = await insertSubmittal(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId: vendorId!,
      subcontractAgreementId: agreementId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      specSection: input.specSection ?? null,
      locationId: input.locationId ?? null,
      drawingId: input.drawingId ?? null,
      drawingRevisionId: input.drawingRevisionId ?? null,
      drawingReference: input.drawingReference ?? null,
      workPackageId: input.workPackageId ?? null,
      dueDate: input.dueDate ?? null,
      reviewerUserId: input.reviewerUserId ?? null,
      createdActorType: 'internal',
      createdByUserId: context.userId,
      createdByPrincipalId: null,
    });
    const revisionId = await insertRevision(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      submittalId: created.id,
      vendorId: vendorId!,
      revisionNumber: 1,
      notes: input.notes ?? null,
      createdActorType: 'internal',
      createdByUserId: context.userId,
      createdByPrincipalId: null,
    });
    await recordAuditEvent(withExecutor(context, tx), {
      action: AUDIT_ACTIONS.SUBMITTAL_CREATED,
      entityType: SUBMITTAL_ENTITY,
      entityId: created.id,
      after: { id: created.id, number: created.number, type: input.type, vendorId, subcontractAgreementId: agreementId },
    });
    return { submittalId: created.id, number: created.number, revisionId };
  });
}

export async function updateSubmittal(context: OrgContext, raw: UpdateInternalSubmittalInput): Promise<SubmittalRow> {
  const input = parseOrThrow(updateInternalSubmittalSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  if (TERMINAL.includes(existing.status)) {
    throw new ConflictError('Closed submittals cannot be edited', 'submittals.errors.closedNotEditable');
  }
  const patch: SubmittalPatch = {};
  const contentKeys = [
    'type',
    'title',
    'description',
    'specSection',
    'locationId',
    'drawingId',
    'drawingRevisionId',
    'drawingReference',
    'workPackageId',
  ] as const;
  for (const key of contentKeys) {
    if (input[key] === undefined) continue;
    if (existing.status !== 'draft') {
      throw fieldError(key, 'submittals.errors.contentFrozen', 'Package details are frozen once submitted');
    }
    (patch as Record<string, unknown>)[key] = input[key] ?? null;
  }
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ?? null;
  if (input.reviewerUserId !== undefined) {
    await assertProjectAssignee(context, existing.projectId, input.reviewerUserId, 'reviewerUserId');
    patch.reviewerUserId = input.reviewerUserId ?? null;
  }
  if (Object.keys(patch).length === 0) return existing;

  return withTransaction(context.db, async (tx) => {
    const updated = await updateSubmittalRow(tx, existing, patch);
    if (!updated) throw new ConflictError('Submittal changed concurrently', 'submittals.errors.concurrentChange');
    await recordAuditEvent(withExecutor(context, tx), {
      action: AUDIT_ACTIONS.SUBMITTAL_UPDATED,
      entityType: SUBMITTAL_ENTITY,
      entityId: existing.id,
      before: { status: existing.status, dueDate: existing.dueDate, reviewerUserId: existing.reviewerUserId },
      after: { status: updated.status, dueDate: updated.dueDate, reviewerUserId: updated.reviewerUserId },
      metadata: { fields: Object.keys(patch) },
    });
    return updated;
  });
}

export async function updateSubmittalRevisionNotes(context: OrgContext, raw: RevisionNotesInput): Promise<void> {
  const input = parseOrThrow(revisionNotesSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  await withTransaction(context.db, (tx) =>
    updateRevisionNotesCore(internalRuntime(withExecutor(context, tx)), existing, input.notes ?? null),
  );
}

export async function submitSubmittal(context: OrgContext, raw: SubmittalActionInput): Promise<SubmittalRow> {
  const input = parseOrThrow(submittalActionSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  return withTransaction(context.db, (tx) => submitCore(internalRuntime(withExecutor(context, tx)), existing));
}

export async function startSubmittalReview(context: OrgContext, raw: SubmittalActionInput): Promise<SubmittalRow> {
  const input = parseOrThrow(submittalActionSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  const next = nextSubmittalStatus(existing.status, 'start_review', 'internal');
  return withTransaction(context.db, async (tx) => {
    const updated = await updateSubmittalRow(tx, existing, {
      status: next,
      reviewerUserId: existing.reviewerUserId ?? context.userId,
    });
    if (!updated) throw new ConflictError('Submittal changed concurrently', 'submittals.errors.concurrentChange');
    await recordAuditEvent(withExecutor(context, tx), {
      action: AUDIT_ACTIONS.SUBMITTAL_REVIEW_STARTED,
      entityType: SUBMITTAL_ENTITY,
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: next },
    });
    return updated;
  });
}

/** Append-only decision on the current submitted revision. */
export async function reviewSubmittal(
  context: OrgContext,
  raw: ReviewSubmittalInput,
): Promise<{ reviewId: string; status: SubmittalStatus }> {
  const input = parseOrThrow(reviewSubmittalSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  const next = nextSubmittalStatus(existing.status, 'review', 'internal', input.decision);
  if (reviewRequiresComments(input.decision) && !input.comments) {
    throw fieldError('comments', 'submittals.errors.commentsRequired', 'Comments are required for this decision');
  }
  const revision = await findCurrentRevision(context.db, existing);
  if (!revision || revision.id !== input.revisionId || !revision.submittedAt) {
    throw new DomainRuleError('Only the current submitted revision can be reviewed', 'submittals.errors.staleRevision');
  }

  return withTransaction(context.db, async (tx) => {
    const reviewId = await insertReview(tx, {
      organizationId: context.organizationId,
      projectId: existing.projectId,
      submittalId: existing.id,
      revisionId: revision.id,
      decision: input.decision,
      comments: input.comments ?? null,
      reviewerUserId: context.userId,
    });
    const updated = await updateSubmittalRow(tx, existing, {
      status: next,
      decidedAt: new Date(),
      reviewerUserId: existing.reviewerUserId ?? context.userId,
    });
    if (!updated) throw new ConflictError('Submittal changed concurrently', 'submittals.errors.concurrentChange');
    const actor = internalActor(context.userId);
    await recordAuditEvent(withExecutor(context, tx), {
      action: AUDIT_ACTIONS.SUBMITTAL_REVIEWED,
      entityType: SUBMITTAL_ENTITY,
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: next, decision: input.decision, revisionNumber: revision.revisionNumber, reviewId },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: existing.projectId,
      type: DOMAIN_EVENTS.SUBMITTAL_PACKAGE_REVIEWED,
      entityType: SUBMITTAL_ENTITY,
      entityId: existing.id,
      actor,
      payload: {
        submittalId: existing.id,
        number: existing.number,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        reviewId,
        decision: input.decision,
        status: next,
        vendorId: existing.vendorId,
        subcontractAgreementId: existing.subcontractAgreementId,
      },
    });
    return { reviewId, status: next };
  });
}

export async function openSubmittalRevision(
  context: OrgContext,
  raw: SubmittalActionInput,
): Promise<{ revisionId: string; revisionNumber: number }> {
  const input = parseOrThrow(submittalActionSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  return withTransaction(context.db, async (tx) => {
    const result = await openRevisionCore(internalRuntime(withExecutor(context, tx)), existing);
    return { revisionId: result.revisionId, revisionNumber: result.submittal.currentRevisionNumber };
  });
}

export async function withdrawSubmittal(context: OrgContext, raw: SubmittalActionInput): Promise<SubmittalRow> {
  const input = parseOrThrow(submittalActionSchema.safeParse(raw));
  const existing = await loadManaged(context, input.submittalId);
  return withTransaction(context.db, (tx) => withdrawCore(internalRuntime(withExecutor(context, tx)), existing));
}

export interface InternalSubmittalView extends SubmittalDetail {
  readonly overdue: boolean;
  readonly canManage: boolean;
  readonly availableActions: readonly SubmittalAction[];
  /** Draft revision open for notes / attachments. */
  readonly draftRevisionId: string | null;
}

export async function getSubmittal(context: OrgContext, submittalId: string): Promise<InternalSubmittalView> {
  const detail = await loadSubmittalDetail(context.db, context.organizationId, submittalId, {
    includeInternalNames: true,
  });
  if (!detail) throw new NotFoundError('Submittal');
  const capabilities = await loadProjectCapabilities(context, detail.projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.PROJECT_VIEW)) throw new NotFoundError('Submittal');
  const canManage = capabilities.has(MANAGE);
  const current = detail.revisions.find((revision) => revision.revisionNumber === detail.currentRevisionNumber);
  const contractor = (await listProjectContractors(context.db, context.organizationId, detail.projectId)).find(
    (option) =>
      option.id === detail.subcontractAgreementId ||
      (!detail.subcontractAgreementId && option.vendorId === detail.vendorId),
  );
  return {
    ...detail,
    vendorName: detail.vendorName ?? contractor?.vendorName ?? null,
    agreementTitle:
      detail.agreementTitle ?? (detail.subcontractAgreementId ? (contractor?.title ?? null) : null),
    overdue: isSubmittalOverdue(detail, todayInTimeZone(context.organization.timezone)),
    canManage,
    availableActions: canManage ? availableSubmittalActions(detail.status, 'internal') : [],
    draftRevisionId: current && !current.submittedAt && detail.status === 'draft' ? current.id : null,
  };
}

export interface SubmittalListResult {
  readonly items: readonly (SubmittalListItem & { readonly overdue: boolean })[];
  readonly hasMore: boolean;
  readonly counts: SubmittalStatusCounts;
  readonly overdueCount: number;
  readonly canManage: boolean;
}

export async function listProjectSubmittals(
  context: OrgContext,
  raw: ListSubmittalsInput,
): Promise<SubmittalListResult> {
  const input = parseOrThrow(listSubmittalsSchema.safeParse(raw));
  const capabilities = await loadProjectCapabilities(context, input.projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.PROJECT_VIEW)) {
    throw new AuthorizationError(`project:${PROJECT_CAPABILITIES.PROJECT_VIEW}`);
  }
  const today = todayInTimeZone(context.organization.timezone);
  const statuses: readonly SubmittalStatus[] | null =
    input.status === 'pending'
      ? SUBMITTAL_PENDING_STATUSES
      : input.status === 'action_required'
        ? SUBMITTAL_CONTRACTOR_ACTION_STATUSES
        : input.status && input.status !== 'overdue'
          ? [input.status]
          : null;
  const base = {
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorIds: input.vendorId ? [input.vendorId] : null,
  };
  const rows = await listSubmittalRows(context.db, {
    ...base,
    statuses,
    type: input.type ?? null,
    overdueBefore: input.status === 'overdue' ? today : null,
    limit: input.limit + 1,
    offset: input.offset,
  });
  const counts = await countSubmittalsByStatus(context.db, base);
  const overdueCount = await countOverdueSubmittalRows(context.db, { ...base, overdueBefore: today });
  const names = vendorNameMap(await listProjectContractors(context.db, context.organizationId, input.projectId));
  return {
    items: rows.slice(0, input.limit).map((row) => ({
      ...row,
      vendorName: row.vendorName ?? names.get(row.vendorId) ?? null,
      overdue: isSubmittalOverdue(row, today),
    })),
    hasMore: rows.length > input.limit,
    counts,
    overdueCount,
    canManage: capabilities.has(MANAGE),
  };
}
