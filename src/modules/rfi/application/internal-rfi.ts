import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { actorColumns, internalActor } from '@/shared/actor';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { AuthorizationError, ConflictError, NotFoundError } from '@/shared/errors';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { assertProjectCapability, loadProjectCapabilities, PROJECT_CAPABILITIES } from '@/modules/project-team';
import {
  availableRfiActions,
  isRfiContentEditable,
  isRfiOverdue,
  isRfiTriageEditable,
  nextRfiStatus,
  rfiActionRequiresReason,
} from '../domain/lifecycle';
import type { RfiAction, RfiDetail, RfiListItem, RfiStatus, RfiStatusCounts } from '../domain/types';
import {
  countRfisByStatus,
  countOverdueRfiRows,
  findLatestRfiAnswerId,
  findRfiRow,
  insertRfi,
  insertRfiAnswer,
  insertRfiStatusEvent,
  listRfiRows,
  loadRfiDetail,
  updateRfiRow,
  type RfiPatch,
  type RfiRow,
} from '../data/rfi.repository';
import {
  answerRfiSchema,
  createInternalRfiSchema,
  listRfisSchema,
  rfiTransitionSchema,
  updateInternalRfiSchema,
  type AnswerRfiInput,
  type CreateInternalRfiInput,
  type ListRfisInput,
  type RfiTransitionInput,
  type UpdateInternalRfiInput,
} from '../validation/schemas';
import { listProjectContractors, vendorNameMap } from '../data/project-options.repository';
import { assertProjectAssignee, fieldError, parseOrThrow, resolveAgreementVendor } from './support';

const RFI_ENTITY = 'rfi';

async function loadForProjectTeam(context: OrgContext, rfiId: string): Promise<RfiRow> {
  const row = await findRfiRow(context.db, context.organizationId, rfiId);
  if (!row || row.archivedAt) throw new NotFoundError('RFI');
  return row;
}

function auditSnapshot(row: RfiRow) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    assigneeUserId: row.assigneeUserId,
    dueDate: row.dueDate,
    priority: row.priority,
  };
}

function eventPayload(row: RfiRow, extra: Record<string, unknown> = {}) {
  return {
    rfiId: row.id,
    number: row.number,
    status: row.status,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    assigneeUserId: row.assigneeUserId,
    dueDate: row.dueDate,
    ...extra,
  };
}

export async function createRfi(
  context: OrgContext,
  raw: CreateInternalRfiInput,
): Promise<{ rfiId: string; number: number; status: RfiStatus }> {
  const input = parseOrThrow(createInternalRfiSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.RFI_MANAGE);
  const { vendorId, agreementId } = await resolveAgreementVendor(
    context.db,
    context.organizationId,
    input.projectId,
    input.subcontractAgreementId,
  );
  await assertProjectAssignee(context, input.projectId, input.assigneeUserId, 'assigneeUserId');

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    const status: 'draft' | 'submitted' = input.submit ? 'submitted' : 'draft';
    const created = await insertRfi(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId,
      subcontractAgreementId: agreementId,
      subject: input.subject,
      question: input.question,
      locationId: input.locationId ?? null,
      drawingId: input.drawingId ?? null,
      drawingRevisionId: input.drawingRevisionId ?? null,
      drawingReference: input.drawingReference ?? null,
      workPackageId: input.workPackageId ?? null,
      priority: input.priority ?? 'normal',
      dueDate: input.dueDate ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      status,
      submittedAt: status === 'submitted' ? new Date() : null,
      raisedActorType: 'internal',
      raisedByUserId: context.userId,
      raisedByPrincipalId: null,
    });
    const actor = internalActor(context.userId);
    await insertRfiStatusEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      rfiId: created.id,
      fromStatus: null,
      toStatus: status,
      reason: null,
      actor: actorColumns(actor),
    });
    await recordAuditEvent(txContext, {
      action: status === 'submitted' ? AUDIT_ACTIONS.RFI_SUBMITTED : AUDIT_ACTIONS.RFI_CREATED,
      entityType: RFI_ENTITY,
      entityId: created.id,
      after: { id: created.id, number: created.number, status, vendorId, subcontractAgreementId: agreementId },
    });
    if (status === 'submitted') {
      await emitDomainEvent(tx, {
        organizationId: context.organizationId,
        projectId: input.projectId,
        type: DOMAIN_EVENTS.RFI_REQUEST_SUBMITTED,
        entityType: RFI_ENTITY,
        entityId: created.id,
        actor,
        payload: {
          rfiId: created.id,
          number: created.number,
          status,
          vendorId,
          subcontractAgreementId: agreementId,
          assigneeUserId: input.assigneeUserId ?? null,
          dueDate: input.dueDate ?? null,
        },
      });
    }
    return { rfiId: created.id, number: created.number, status };
  });
}

export async function updateRfi(context: OrgContext, raw: UpdateInternalRfiInput): Promise<RfiRow> {
  const input = parseOrThrow(updateInternalRfiSchema.safeParse(raw));
  const existing = await loadForProjectTeam(context, input.rfiId);
  await assertProjectCapability(context, existing.projectId, PROJECT_CAPABILITIES.RFI_MANAGE);
  if (!isRfiTriageEditable(existing.status)) {
    throw new ConflictError('Closed RFIs cannot be edited', 'rfi.errors.closedNotEditable');
  }

  const patch: RfiPatch = {};
  const contentChange =
    input.subject !== undefined || input.question !== undefined || input.subcontractAgreementId !== undefined;
  if (contentChange) {
    if (!isRfiContentEditable(existing.status)) {
      throw fieldError('question', 'rfi.errors.questionFrozen', 'The question is frozen once submitted');
    }
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.question !== undefined) patch.question = input.question;
    if (input.subcontractAgreementId !== undefined) {
      const resolved = await resolveAgreementVendor(
        context.db,
        context.organizationId,
        existing.projectId,
        input.subcontractAgreementId,
      );
      patch.vendorId = resolved.vendorId;
      patch.subcontractAgreementId = resolved.agreementId;
    }
  }
  if (input.assigneeUserId !== undefined) {
    await assertProjectAssignee(context, existing.projectId, input.assigneeUserId, 'assigneeUserId');
    patch.assigneeUserId = input.assigneeUserId ?? null;
  }
  if (input.locationId !== undefined) patch.locationId = input.locationId ?? null;
  if (input.drawingId !== undefined) patch.drawingId = input.drawingId ?? null;
  if (input.drawingRevisionId !== undefined) patch.drawingRevisionId = input.drawingRevisionId ?? null;
  if (input.drawingReference !== undefined) patch.drawingReference = input.drawingReference ?? null;
  if (input.workPackageId !== undefined) patch.workPackageId = input.workPackageId ?? null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ?? null;
  if (Object.keys(patch).length === 0) return existing;

  return withTransaction(context.db, async (tx) => {
    const updated = await updateRfiRow(tx, context.organizationId, existing.id, existing.status, patch);
    if (!updated) throw new ConflictError('RFI changed concurrently', 'rfi.errors.concurrentChange');
    await recordAuditEvent(withExecutor(context, tx), {
      action: AUDIT_ACTIONS.RFI_UPDATED,
      entityType: RFI_ENTITY,
      entityId: updated.id,
      before: auditSnapshot(existing),
      after: auditSnapshot(updated),
    });
    return updated;
  });
}

const TRANSITION_AUDIT = {
  submit: AUDIT_ACTIONS.RFI_SUBMITTED,
  start_review: AUDIT_ACTIONS.RFI_REVIEW_STARTED,
  answer: AUDIT_ACTIONS.RFI_ANSWERED,
  close: AUDIT_ACTIONS.RFI_CLOSED,
  reopen: AUDIT_ACTIONS.RFI_REOPENED,
} as const;

const TRANSITION_EVENT = {
  submit: DOMAIN_EVENTS.RFI_REQUEST_SUBMITTED,
  answer: DOMAIN_EVENTS.RFI_REQUEST_ANSWERED,
  close: DOMAIN_EVENTS.RFI_REQUEST_CLOSED,
  reopen: DOMAIN_EVENTS.RFI_REQUEST_REOPENED,
} as const;

function transitionPatch(row: RfiRow, action: RfiAction, next: RfiStatus): RfiPatch {
  const now = new Date();
  switch (action) {
    case 'submit':
      return { status: next, submittedAt: now };
    case 'start_review':
      return { status: next };
    case 'answer':
      return { status: next, answeredAt: now };
    case 'close':
      return { status: next, closedAt: now };
    case 'reopen':
      return { status: next, closedAt: null, reopenCount: row.reopenCount + 1 };
  }
}

/** Runs one lifecycle step inside an open transaction (status row + history + audit + event). */
async function applyInternalTransition(
  context: OrgContext,
  existing: RfiRow,
  action: RfiAction,
  reason: string | null,
  extraPayload: Record<string, unknown> = {},
): Promise<RfiRow> {
  const next = nextRfiStatus(existing.status, action, 'internal');
  if (rfiActionRequiresReason(existing.status, action) && !reason) {
    throw fieldError('reason', 'rfi.errors.reasonRequired', 'A reason is required');
  }
  const updated = await updateRfiRow(
    context.db,
    context.organizationId,
    existing.id,
    existing.status,
    transitionPatch(existing, action, next),
  );
  if (!updated) throw new ConflictError('RFI changed concurrently', 'rfi.errors.concurrentChange');
  const actor = internalActor(context.userId);
  await insertRfiStatusEvent(context.db, {
    organizationId: context.organizationId,
    projectId: existing.projectId,
    rfiId: existing.id,
    fromStatus: existing.status,
    toStatus: next,
    reason,
    actor: actorColumns(actor),
  });
  await recordAuditEvent(context, {
    action: TRANSITION_AUDIT[action],
    entityType: RFI_ENTITY,
    entityId: existing.id,
    before: { status: existing.status },
    after: { status: next },
    metadata: reason ? { reason } : undefined,
  });
  const eventType = action in TRANSITION_EVENT ? TRANSITION_EVENT[action as keyof typeof TRANSITION_EVENT] : null;
  if (eventType) {
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: existing.projectId,
      type: eventType,
      entityType: RFI_ENTITY,
      entityId: existing.id,
      actor,
      payload: eventPayload(updated, { fromStatus: existing.status, ...extraPayload }),
    });
  }
  return updated;
}

async function transition(context: OrgContext, raw: RfiTransitionInput, action: RfiAction): Promise<RfiRow> {
  const input = parseOrThrow(rfiTransitionSchema.safeParse(raw));
  const existing = await loadForProjectTeam(context, input.rfiId);
  await assertProjectCapability(context, existing.projectId, PROJECT_CAPABILITIES.RFI_MANAGE);
  return withTransaction(context.db, (tx) =>
    applyInternalTransition(withExecutor(context, tx), existing, action, input.reason ?? null),
  );
}

export function submitRfi(context: OrgContext, raw: RfiTransitionInput) {
  return transition(context, raw, 'submit');
}

export function startRfiReview(context: OrgContext, raw: RfiTransitionInput) {
  return transition(context, raw, 'start_review');
}

export function closeRfi(context: OrgContext, raw: RfiTransitionInput) {
  return transition(context, raw, 'close');
}

/** Audited reopen: answered | closed -> under_review with a mandatory reason. */
export function reopenRfi(context: OrgContext, raw: RfiTransitionInput) {
  return transition(context, raw, 'reopen');
}

/** Official answer (append-only). A later answer after reopen supersedes the previous one. */
export async function answerRfi(
  context: OrgContext,
  raw: AnswerRfiInput,
): Promise<{ answerId: string; status: RfiStatus }> {
  const input = parseOrThrow(answerRfiSchema.safeParse(raw));
  const existing = await loadForProjectTeam(context, input.rfiId);
  await assertProjectCapability(context, existing.projectId, PROJECT_CAPABILITIES.RFI_MANAGE);
  nextRfiStatus(existing.status, 'answer', 'internal');

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    const supersedesAnswerId = await findLatestRfiAnswerId(tx, context.organizationId, existing.id);
    const answerId = await insertRfiAnswer(tx, {
      organizationId: context.organizationId,
      projectId: existing.projectId,
      rfiId: existing.id,
      body: input.body,
      answeredByUserId: context.userId,
      supersedesAnswerId,
    });
    let row = await applyInternalTransition(txContext, existing, 'answer', null, { answerId, supersedesAnswerId });
    if (input.close) row = await applyInternalTransition(txContext, row, 'close', null);
    return { answerId, status: row.status };
  });
}

export interface InternalRfiView extends RfiDetail {
  readonly overdue: boolean;
  readonly canManage: boolean;
  readonly availableActions: readonly RfiAction[];
  readonly contentEditable: boolean;
}

export async function getRfi(context: OrgContext, rfiId: string): Promise<InternalRfiView> {
  const detail = await loadRfiDetail(context.db, context.organizationId, rfiId, { includeInternalNames: true });
  if (!detail) throw new NotFoundError('RFI');
  const capabilities = await loadProjectCapabilities(context, detail.projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.PROJECT_VIEW)) throw new NotFoundError('RFI');
  const canManage = capabilities.has(PROJECT_CAPABILITIES.RFI_MANAGE);
  const today = todayInTimeZone(context.organization.timezone);
  const contractor = detail.subcontractAgreementId || detail.vendorId
    ? (await listProjectContractors(context.db, context.organizationId, detail.projectId)).find(
        (option) =>
          option.id === detail.subcontractAgreementId ||
          (!detail.subcontractAgreementId && option.vendorId === detail.vendorId),
      )
    : undefined;
  return {
    ...detail,
    vendorName: detail.vendorName ?? contractor?.vendorName ?? null,
    agreementTitle:
      detail.agreementTitle ?? (detail.subcontractAgreementId ? (contractor?.title ?? null) : null),
    overdue: isRfiOverdue(detail, today),
    canManage,
    availableActions: canManage ? availableRfiActions(detail.status, 'internal') : [],
    contentEditable: canManage && isRfiContentEditable(detail.status),
  };
}

export interface RfiListResult {
  readonly items: readonly (RfiListItem & { readonly overdue: boolean })[];
  readonly hasMore: boolean;
  readonly counts: RfiStatusCounts;
  readonly overdueCount: number;
  readonly canManage: boolean;
}

export async function listProjectRfis(context: OrgContext, raw: ListRfisInput): Promise<RfiListResult> {
  const input = parseOrThrow(listRfisSchema.safeParse(raw));
  const capabilities = await loadProjectCapabilities(context, input.projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.PROJECT_VIEW)) {
    throw new AuthorizationError(`project:${PROJECT_CAPABILITIES.PROJECT_VIEW}`);
  }
  const today = todayInTimeZone(context.organization.timezone);
  const statuses: RfiStatus[] | null =
    input.status === 'open'
      ? ['draft', 'submitted', 'under_review', 'answered']
      : input.status && input.status !== 'overdue'
        ? [input.status]
        : null;
  const base = {
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorIds: input.vendorId ? [input.vendorId] : null,
  };
  const rows = await listRfiRows(context.db, {
    ...base,
    statuses,
    overdueBefore: input.status === 'overdue' ? today : null,
    limit: input.limit + 1,
    offset: input.offset,
  });
  const counts = await countRfisByStatus(context.db, base);
  const overdueCount = await countOverdueRfiRows(context.db, { ...base, overdueBefore: today });
  const names = vendorNameMap(await listProjectContractors(context.db, context.organizationId, input.projectId));
  return {
    items: rows.slice(0, input.limit).map((row) => ({
      ...row,
      vendorName: row.vendorName ?? (row.vendorId ? (names.get(row.vendorId) ?? null) : null),
      overdue: isRfiOverdue(row, today),
    })),
    hasMore: rows.length > input.limit,
    counts,
    overdueCount,
    canManage: capabilities.has(PROJECT_CAPABILITIES.RFI_MANAGE),
  };
}
