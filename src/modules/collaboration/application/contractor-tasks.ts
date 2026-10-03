import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { externalActor, internalActor, type Actor } from '@/shared/actor';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { AuthorizationError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import {
  PROJECT_CAPABILITIES,
  assertAnyProjectCapability,
  assertProjectCapability,
  loadProjectCapabilities,
} from '@/modules/project-team';
import { createProjectCapabilityTask, findTaskById } from '@/modules/tasks';
import { countEvidence } from '@/modules/evidence';
import {
  availableExternalTaskCommands,
  isTerminalExternalStatus,
  planExternalTaskTransition,
  transitionTimestamps,
  type ExternalTaskCommand,
  type ExternalTaskCommandType,
  type ExternalTaskEventAction,
  type ExternalTaskStatus,
  type ExternalTaskTransition,
  type LifecycleActor,
} from '../domain/task-lifecycle';
import {
  findContractorTask,
  findTaskExternalAssignment,
  insertEntityLink,
  insertTaskExternalAssignment,
  insertTaskExternalEvent,
  listContractorTasks,
  listTaskEntityLinks,
  listTaskExternalEvents,
  loadPrincipalNames,
  loadProfileNames,
  loadVendorNames,
  updateTaskExternalAssignment,
  type ContractorTaskRow,
  type TaskExternalAssignmentRow,
  type TaskLinkRow,
} from '../data/collaboration.repository';
import { auditExternal, auditInternal } from './audit';
import { entityBelongsToProject, isLinkableEntityType } from './entity-refs';

const C = PROJECT_CAPABILITIES;
const X = EXTERNAL_CAPABILITIES;

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
type LinkedTaskPriority = (typeof PRIORITIES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ContractorAssigneeInput {
  readonly vendorId: string;
  readonly subcontractAgreementId?: string | null;
  readonly principalId?: string | null;
  readonly requiresEvidence?: boolean;
  readonly locationId?: string | null;
  readonly workPackageId?: string | null;
  readonly subcontractWorkLineId?: string | null;
}

const EVENT_FOR_ACTION: Record<ExternalTaskEventAction, (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS]> = {
  assigned: DOMAIN_EVENTS.TASK_EXTERNAL_ASSIGNED,
  reassigned: DOMAIN_EVENTS.TASK_EXTERNAL_ASSIGNED,
  acknowledged: DOMAIN_EVENTS.TASK_EXTERNAL_ACKNOWLEDGED,
  started: DOMAIN_EVENTS.TASK_EXTERNAL_STARTED,
  completion_submitted: DOMAIN_EVENTS.TASK_EXTERNAL_COMPLETION_SUBMITTED,
  verified: DOMAIN_EVENTS.TASK_EXTERNAL_VERIFIED,
  reopened: DOMAIN_EVENTS.TASK_EXTERNAL_REOPENED,
  closed: DOMAIN_EVENTS.TASK_EXTERNAL_CLOSED,
  cancelled: DOMAIN_EVENTS.TASK_EXTERNAL_CANCELLED,
};

const AUDIT_FOR_ACTION = {
  assigned: AUDIT_ACTIONS.TASK_EXTERNAL_ASSIGNED,
  reassigned: AUDIT_ACTIONS.TASK_EXTERNAL_REASSIGNED,
  acknowledged: AUDIT_ACTIONS.TASK_EXTERNAL_ACKNOWLEDGED,
  started: AUDIT_ACTIONS.TASK_EXTERNAL_STARTED,
  completion_submitted: AUDIT_ACTIONS.TASK_EXTERNAL_COMPLETION_SUBMITTED,
  verified: AUDIT_ACTIONS.TASK_EXTERNAL_VERIFIED,
  reopened: AUDIT_ACTIONS.TASK_EXTERNAL_REOPENED,
  closed: AUDIT_ACTIONS.TASK_EXTERNAL_CLOSED,
  cancelled: AUDIT_ACTIONS.TASK_EXTERNAL_CANCELLED,
} as const satisfies Record<ExternalTaskEventAction, string>;

function eventPayload(
  assignment: Pick<
    TaskExternalAssignmentRow,
    'vendorId' | 'subcontractAgreementId' | 'principalId' | 'locationId' | 'workPackageId' | 'cycle'
  >,
  title: string,
  transition?: Pick<ExternalTaskTransition, 'from' | 'to' | 'outcome' | 'quality'> & { cycle: number },
): Record<string, unknown> {
  return {
    title,
    vendorId: assignment.vendorId,
    subcontractAgreementId: assignment.subcontractAgreementId,
    principalId: assignment.principalId,
    locationId: assignment.locationId,
    workPackageId: assignment.workPackageId,
    cycle: transition?.cycle ?? assignment.cycle,
    ...(transition
      ? {
          fromStatus: transition.from,
          toStatus: transition.to,
          outcome: transition.outcome ?? undefined,
          quality: transition.quality ?? undefined,
        }
      : { toStatus: 'assigned' }),
  };
}

function mapIntegrityError(error: unknown): never {
  const code = (error as { code?: string; cause?: { code?: string } })?.code
    ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === '23503' || code === '23514') {
    throw new ValidationError(
      [{ path: 'assignee', message: 'Contractor, agreement, location or work line does not match this project' }],
      'Invalid contractor assignment',
    );
  }
  throw error;
}

// ─── Assignment (internal) ───────────────────────────────────────────────────

async function writeAssignment(
  context: OrgContext,
  task: { id: string; projectId: string; title: string },
  input: ContractorAssigneeInput,
): Promise<void> {
  const existing = await findTaskExternalAssignment(context.db, context.organizationId, task.id);
  const values = {
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId ?? null,
    principalId: input.principalId ?? null,
    requiresEvidence: input.requiresEvidence ?? false,
    locationId: input.locationId ?? null,
    workPackageId: input.workPackageId ?? null,
    subcontractWorkLineId: input.subcontractWorkLineId ?? null,
  };
  const actor = internalActor(context.userId);

  if (!existing) {
    try {
      await insertTaskExternalAssignment(context.db, {
        taskId: task.id,
        organizationId: context.organizationId,
        projectId: task.projectId,
        status: 'assigned',
        assignedByUserId: context.userId,
        ...values,
      });
    } catch (error) {
      mapIntegrityError(error);
    }
  } else {
    if (existing.status !== 'assigned' && existing.status !== 'acknowledged') {
      throw new DomainRuleError(
        'Contractor can only be changed before work starts',
        'collaboration.errors.reassignNotAllowed',
      );
    }
    try {
      const updated = await updateTaskExternalAssignment(context.db, context.organizationId, task.id, existing.status, {
        ...values,
        status: 'assigned',
        acknowledgedAt: null,
        assignedByUserId: context.userId,
      });
      if (!updated) throw new DomainRuleError('Task changed concurrently', 'collaboration.errors.concurrentChange');
    } catch (error) {
      mapIntegrityError(error);
    }
  }

  const action: ExternalTaskEventAction = existing ? 'reassigned' : 'assigned';
  const row = { ...values, cycle: existing?.cycle ?? 1 };
  await insertTaskExternalEvent(context.db, {
    organizationId: context.organizationId,
    projectId: task.projectId,
    taskId: task.id,
    action,
    fromStatus: existing?.status ?? null,
    toStatus: 'assigned',
    cycle: row.cycle,
    actor,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: task.projectId,
    type: DOMAIN_EVENTS.TASK_EXTERNAL_ASSIGNED,
    entityType: 'task',
    entityId: task.id,
    actor,
    payload: eventPayload(row, task.title),
  });
  await auditInternal(context, {
    action: AUDIT_FOR_ACTION[action],
    entityType: 'task',
    entityId: task.id,
    after: { ...values, status: 'assigned' },
  });
}

async function loadProjectTask(context: OrgContext, taskId: string) {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task || !task.projectId) throw new NotFoundError('Task');
  return { id: task.id, projectId: task.projectId, title: task.title };
}

/** Assigns (or re-assigns before work starts) an existing project task to a contractor company / user. */
export async function assignTaskToContractor(
  context: OrgContext,
  taskId: string,
  input: ContractorAssigneeInput,
): Promise<void> {
  const task = await loadProjectTask(context, taskId);
  await assertProjectCapability(context, task.projectId, C.TASKS_MANAGE);
  await withTransaction(context.db, (tx) => writeAssignment(withExecutor(context, tx), task, input));
}

// ─── Linked tasks (frozen API) ───────────────────────────────────────────────

export interface LinkedTaskSourceInput {
  readonly entityType: string;
  readonly entityId: string;
  readonly relation?: string;
}

export interface CreateLinkedTaskCommand {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly priority?: LinkedTaskPriority;
  readonly assignee:
    | { readonly kind: 'none' }
    | { readonly kind: 'user'; readonly userId: string }
    | {
        readonly kind: 'contractor';
        readonly vendorId: string;
        readonly subcontractAgreementId?: string | null;
        readonly principalId?: string | null;
      };
  readonly locationId?: string | null;
  readonly workPackageId?: string | null;
  readonly subcontractWorkLineId?: string | null;
  readonly requiresEvidence?: boolean;
  readonly sources?: readonly LinkedTaskSourceInput[];
}

async function linkEntityToTask(
  context: OrgContext,
  task: { id: string; projectId: string },
  source: LinkedTaskSourceInput,
  defaultRelation: string,
): Promise<void> {
  const relation = source.relation ?? defaultRelation;
  if (!/^[a-z][a-z0-9_]*$/.test(relation)) {
    throw new ValidationError([{ path: 'relation', message: 'Invalid relation' }]);
  }
  if (!isLinkableEntityType(source.entityType)) {
    throw new ValidationError([{ path: 'entityType', message: `Unknown entity type ${source.entityType}` }]);
  }
  const ok = await entityBelongsToProject(
    context.db,
    source.entityType,
    context.organizationId,
    task.projectId,
    source.entityId,
  );
  if (!ok) throw new NotFoundError('Linked entity');
  await insertEntityLink(context.db, {
    organizationId: context.organizationId,
    projectId: task.projectId,
    sourceType: source.entityType,
    sourceId: source.entityId,
    targetType: 'task',
    targetId: task.id,
    relation,
    actor: internalActor(context.userId),
  });
}

export async function createLinkedTaskUseCase(
  context: OrgContext,
  input: CreateLinkedTaskCommand,
): Promise<{ readonly taskId: string }> {
  await assertProjectCapability(context, input.projectId, C.TASKS_MANAGE);
  const title = input.title?.trim() ?? '';
  if (!title || title.length > 500) {
    throw new ValidationError([{ path: 'title', message: 'Title is required (max 500 characters)' }]);
  }
  if (input.dueDate && !DATE_RE.test(input.dueDate)) {
    throw new ValidationError([{ path: 'dueDate', message: 'Invalid date' }]);
  }
  if (input.priority && !PRIORITIES.includes(input.priority)) {
    throw new ValidationError([{ path: 'priority', message: 'Invalid priority' }]);
  }

  return withTransaction(context.db, async (tx) => {
    const ctx = withExecutor(context, tx);
    const task = await createProjectCapabilityTask(ctx, {
      projectId: input.projectId,
      title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? 'medium',
      source: 'manual',
      assigneeUserId: input.assignee.kind === 'user' ? input.assignee.userId : null,
    });
    const ref = { id: task.id, projectId: input.projectId, title: task.title };

    if (input.assignee.kind === 'contractor') {
      await writeAssignment(ctx, ref, {
        vendorId: input.assignee.vendorId,
        subcontractAgreementId: input.assignee.subcontractAgreementId ?? null,
        principalId: input.assignee.principalId ?? null,
        requiresEvidence: input.requiresEvidence ?? false,
        locationId: input.locationId ?? null,
        workPackageId: input.workPackageId ?? null,
        subcontractWorkLineId: input.subcontractWorkLineId ?? null,
      });
    } else {
      for (const [entityType, entityId] of [
        ['project_location', input.locationId],
        ['work_package', input.workPackageId],
        ['subcontract_work_line', input.subcontractWorkLineId],
      ] as const) {
        if (entityId) await linkEntityToTask(ctx, ref, { entityType, entityId }, 'located_at');
      }
    }

    const sources = input.sources ?? [];
    for (const source of sources) await linkEntityToTask(ctx, ref, source, 'follow_up');

    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.TASK_LINKED_CREATED,
      entityType: 'task',
      entityId: task.id,
      actor: internalActor(context.userId),
      payload: {
        title: task.title,
        sources: sources.map((s) => ({ entityType: s.entityType, entityId: s.entityId })),
        vendorId: input.assignee.kind === 'contractor' ? input.assignee.vendorId : undefined,
        locationId: input.locationId ?? undefined,
        workPackageId: input.workPackageId ?? undefined,
      },
    });
    if (sources.length > 0) {
      await auditInternal(ctx, {
        action: AUDIT_ACTIONS.TASK_LINK_CREATED,
        entityType: 'task',
        entityId: task.id,
        after: { sources },
      });
    }
    return { taskId: task.id };
  });
}

/** Adds an entity link (project, vendor, agreement, work line, location, event, defect, RFI, ...) to a task. */
export async function linkTaskToEntity(
  context: OrgContext,
  taskId: string,
  source: LinkedTaskSourceInput,
): Promise<void> {
  const task = await loadProjectTask(context, taskId);
  await assertProjectCapability(context, task.projectId, C.TASKS_MANAGE);
  await withTransaction(context.db, async (tx) => {
    const ctx = withExecutor(context, tx);
    await linkEntityToTask(ctx, task, source, 'related');
    await auditInternal(ctx, {
      action: AUDIT_ACTIONS.TASK_LINK_CREATED,
      entityType: 'task',
      entityId: task.id,
      after: { entityType: source.entityType, entityId: source.entityId, relation: source.relation ?? 'related' },
    });
  });
}

// ─── Lifecycle commands ──────────────────────────────────────────────────────

async function applyTransition(
  db: OrgContext['db'],
  organizationId: string,
  row: ContractorTaskRow,
  transition: ExternalTaskTransition,
  actor: Actor,
): Promise<void> {
  const now = new Date();
  const patch: Parameters<typeof updateTaskExternalAssignment>[4] = {
    status: transition.to,
    cycle: transition.cycle,
    ...transitionTimestamps(transition, now),
  };
  if (transition.action === 'verified') {
    patch.lastOutcome = transition.outcome;
    if (transition.quality) patch.lastQuality = transition.quality;
  }
  if (transition.action === 'closed' && transition.quality) patch.lastQuality = transition.quality;
  if (transition.action === 'completion_submitted') patch.lastSubmittedEvidenceCount = transition.evidenceCount;

  const updated = await updateTaskExternalAssignment(db, organizationId, row.taskId, transition.from, patch);
  if (!updated) throw new DomainRuleError('Task changed concurrently', 'collaboration.errors.concurrentChange');

  await insertTaskExternalEvent(db, {
    organizationId,
    projectId: row.projectId,
    taskId: row.taskId,
    action: transition.action,
    fromStatus: transition.from,
    toStatus: transition.to,
    outcome: transition.outcome,
    quality: transition.quality,
    note: transition.note,
    evidenceCount: transition.evidenceCount,
    cycle: transition.cycle,
    actor,
  });
  await emitDomainEvent(db, {
    organizationId,
    projectId: row.projectId,
    type: EVENT_FOR_ACTION[transition.action],
    entityType: 'task',
    entityId: row.taskId,
    actor,
    payload: eventPayload(row, row.title, transition),
  });
}

const INTERNAL_COMMAND_CAPS: Record<Exclude<ExternalTaskCommandType, 'acknowledge' | 'start' | 'submit_completion'>, readonly (typeof C)[keyof typeof C][]> = {
  verify: [C.PROGRESS_VERIFY, C.TASKS_MANAGE],
  reopen: [C.TASKS_MANAGE],
  close: [C.PROGRESS_VERIFY, C.TASKS_MANAGE],
  cancel: [C.TASKS_MANAGE],
};

export type InternalTaskCommand = Extract<ExternalTaskCommand, { type: 'verify' | 'reopen' | 'close' | 'cancel' }>;

/** Verification / reopen / close / cancel by the project team. */
export async function runInternalTaskCommand(
  context: OrgContext,
  taskId: string,
  command: InternalTaskCommand,
): Promise<{ readonly status: ExternalTaskStatus }> {
  const row = await findContractorTask(context.db, context.organizationId, taskId);
  if (!row) throw new NotFoundError('Task');
  const caps = INTERNAL_COMMAND_CAPS[command.type];
  if (!caps) throw new AuthorizationError('collaboration:command');
  await assertAnyProjectCapability(context, row.projectId, caps);
  const transition = planExternalTaskTransition(
    {
      status: row.status,
      cycle: row.cycle,
      requiresEvidence: row.requiresEvidence,
      lastSubmittedEvidenceCount: row.lastSubmittedEvidenceCount,
    },
    command,
    'internal',
  );
  const actor = internalActor(context.userId);
  await withTransaction(context.db, async (tx) => {
    const ctx = withExecutor(context, tx);
    await applyTransition(tx, context.organizationId, row, transition, actor);
    await auditInternal(ctx, {
      action: AUDIT_FOR_ACTION[transition.action],
      entityType: 'task',
      entityId: row.taskId,
      after: { from: transition.from, to: transition.to, outcome: transition.outcome, quality: transition.quality, cycle: transition.cycle },
      metadata: transition.note ? { note: transition.note } : undefined,
    });
  });
  return { status: transition.to };
}

export type ContractorTaskCommand = Extract<ExternalTaskCommand, { type: 'acknowledge' | 'start' | 'reopen' }>
  | { readonly type: 'submit_completion'; readonly note?: string | null };

function externalTarget(row: ContractorTaskRow) {
  return {
    organizationId: row.organizationId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
  };
}

/** Acknowledge / start / submit completion (evidence gate) / reopen after rejection - by the contractor. */
export async function runContractorTaskCommand(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly taskId: string; readonly command: ContractorTaskCommand },
): Promise<{ readonly status: ExternalTaskStatus }> {
  return withTransaction(context.db, async (tx) => {
    const row = await findContractorTask(tx, input.organizationId, input.taskId);
    if (!row) throw new NotFoundError('Task');
    requireExternalScope(context, externalTarget(row), X.TASK_WORK);
    if (row.principalId && row.principalId !== context.principalId) {
      throw new AuthorizationError('external:task.assigned_to_other_user');
    }
    const command: ExternalTaskCommand =
      input.command.type === 'submit_completion'
        ? {
            type: 'submit_completion',
            note: input.command.note ?? null,
            evidenceCount: row.requiresEvidence
              ? await countEvidence(tx, {
                  organizationId: input.organizationId,
                  entityType: 'task',
                  entityId: input.taskId,
                })
              : null,
          }
        : input.command;
    const transition = planExternalTaskTransition(
      {
        status: row.status,
        cycle: row.cycle,
        requiresEvidence: row.requiresEvidence,
        lastSubmittedEvidenceCount: row.lastSubmittedEvidenceCount,
      },
      command,
      'external',
    );
    const actor = externalActor(context.principalId);
    const external = { ...context, db: tx };
    await applyTransition(tx, input.organizationId, row, transition, actor);
    await auditExternal(external, input.organizationId, {
      action: AUDIT_FOR_ACTION[transition.action],
      entityType: 'task',
      entityId: row.taskId,
      after: { from: transition.from, to: transition.to, cycle: transition.cycle, evidenceCount: transition.evidenceCount },
    });
    return { status: transition.to };
  });
}

// ─── Read models ─────────────────────────────────────────────────────────────

export interface TaskHistoryEntry {
  readonly id: string;
  readonly action: ExternalTaskEventAction;
  readonly fromStatus: ExternalTaskStatus | null;
  readonly toStatus: ExternalTaskStatus;
  readonly outcome: string | null;
  readonly quality: string | null;
  readonly note: string | null;
  readonly evidenceCount: number | null;
  readonly cycle: number;
  readonly actorType: 'internal' | 'external' | 'system';
  /** Display name when the viewer is allowed to see it. */
  readonly actorName: string | null;
  readonly createdAt: string;
}

export interface ContractorTaskView {
  readonly taskId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly priority: string;
  readonly status: ExternalTaskStatus;
  readonly requiresEvidence: boolean;
  readonly cycle: number;
  readonly lastOutcome: string | null;
  readonly lastQuality: string | null;
  readonly locationName: string | null;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly principalId: string | null;
  readonly updatedAt: string;
}

function toView(row: ContractorTaskRow): ContractorTaskView {
  return {
    taskId: row.taskId,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    priority: row.priority,
    status: row.status,
    requiresEvidence: row.requiresEvidence,
    cycle: row.cycle,
    lastOutcome: row.lastOutcome,
    lastQuality: row.lastQuality,
    locationName: row.locationName,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    principalId: row.principalId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface InternalTaskContractorPanel {
  readonly eligible: boolean;
  readonly projectId: string | null;
  readonly canManage: boolean;
  readonly canVerify: boolean;
  readonly assignment:
    | (ContractorTaskView & {
        readonly vendorName: string | null;
        readonly principalName: string | null;
        readonly availableCommands: readonly ExternalTaskCommandType[];
        readonly terminal: boolean;
      })
    | null;
  readonly history: readonly TaskHistoryEntry[];
  readonly links: readonly TaskLinkRow[];
}

/** Contractor panel inside the existing task detail (internal viewers with tasks.view). */
export async function getTaskContractorPanel(context: OrgContext, taskId: string): Promise<InternalTaskContractorPanel> {
  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');
  if (!task.projectId) {
    return { eligible: false, projectId: null, canManage: false, canVerify: false, assignment: null, history: [], links: [] };
  }
  const held = await loadProjectCapabilities(context, task.projectId);
  if (!held.has(C.TASKS_VIEW)) {
    return { eligible: false, projectId: task.projectId, canManage: false, canVerify: false, assignment: null, history: [], links: [] };
  }
  const canManage = held.has(C.TASKS_MANAGE);
  const canVerify = canManage || held.has(C.PROGRESS_VERIFY);
  const [row, events, links] = await Promise.all([
    findContractorTask(context.db, context.organizationId, taskId),
    listTaskExternalEvents(context.db, context.organizationId, taskId),
    listTaskEntityLinks(context.db, context.organizationId, taskId),
  ]);
  const [profileNames, principalNames, vendorNames] = await Promise.all([
    loadProfileNames(context.db, events.flatMap((e) => (e.actorUserId ? [e.actorUserId] : []))),
    loadPrincipalNames(context.db, [
      ...events.flatMap((e) => (e.actorPrincipalId ? [e.actorPrincipalId] : [])),
      ...(row?.principalId ? [row.principalId] : []),
    ]),
    loadVendorNames(context.db, context.organizationId, row ? [row.vendorId] : []),
  ]);
  const actor: LifecycleActor = 'internal';
  const commands = row
    ? availableExternalTaskCommands({ status: row.status }, actor).filter((command) =>
        command === 'verify' || command === 'close' ? canVerify : canManage,
      )
    : [];
  return {
    eligible: true,
    projectId: task.projectId,
    canManage,
    canVerify,
    assignment: row
      ? {
          ...toView(row),
          vendorName: vendorNames.get(row.vendorId) ?? null,
          principalName: row.principalId ? principalNames.get(row.principalId) ?? null : null,
          availableCommands: commands,
          terminal: isTerminalExternalStatus(row.status),
        }
      : null,
    history: events.map((event) => ({
      id: event.id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      outcome: event.outcome,
      quality: event.quality,
      note: event.note,
      evidenceCount: event.evidenceCount,
      cycle: event.cycle,
      actorType: event.actorType,
      actorName: event.actorUserId
        ? profileNames.get(event.actorUserId) ?? null
        : event.actorPrincipalId
          ? principalNames.get(event.actorPrincipalId) ?? null
          : null,
      createdAt: event.createdAt.toISOString(),
    })),
    links,
  };
}

/** Internal list of contractor tasks on a project (Contractor 360 / execution views). */
export async function listProjectContractorTasks(
  context: OrgContext,
  input: { readonly projectId: string; readonly vendorId?: string | null; readonly openOnly?: boolean; readonly limit?: number },
): Promise<readonly ContractorTaskView[]> {
  await assertProjectCapability(context, input.projectId, C.TASKS_VIEW);
  const rows = await listContractorTasks(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorIds: input.vendorId ? [input.vendorId] : null,
    statuses: input.openOnly
      ? ['assigned', 'acknowledged', 'in_progress', 'completion_submitted', 'resubmitted', 'approved', 'rejected', 'rework_required', 'reopened']
      : null,
    limit: Math.min(Math.max(input.limit ?? 100, 1), 200),
  });
  return rows.map(toView);
}

// ─── Contractor portal read models ───────────────────────────────────────────

function taskVendorIds(context: ExternalContext, organizationId: string, projectId: string | null): string[] {
  return [
    ...new Set(
      context.grants
        .filter(
          (grant) =>
            grant.organizationId === organizationId &&
            (projectId === null || grant.projectId === null || grant.projectId === projectId) &&
            (grant.capabilities.has(X.TASK_WORK) || grant.capabilities.has(X.TASK_REPORT)),
        )
        .map((grant) => grant.vendorId),
    ),
  ];
}

export interface ContractorPortalTask extends ContractorTaskView {
  readonly assignedToMe: boolean;
  readonly canAct: boolean;
  readonly availableCommands: readonly ExternalTaskCommandType[];
  readonly overdue: boolean;
}

function toPortalTask(context: ExternalContext, row: ContractorTaskRow, today: string): ContractorPortalTask {
  const canAct =
    hasExternalScope(context, externalTarget(row), X.TASK_WORK) &&
    (row.principalId === null || row.principalId === context.principalId);
  return {
    ...toView(row),
    assignedToMe: row.principalId === context.principalId,
    canAct,
    availableCommands: canAct ? availableExternalTaskCommands({ status: row.status }, 'external') : [],
    overdue: Boolean(row.dueDate && row.dueDate < today && !isTerminalExternalStatus(row.status) && row.status !== 'approved'),
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Contractor portal task list (own vendors only; projectId null = all projects of the organization). */
export async function listContractorPortalTasks(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string | null; readonly openOnly?: boolean; readonly limit?: number },
): Promise<readonly ContractorPortalTask[]> {
  const vendorIds = taskVendorIds(context, input.organizationId, input.projectId);
  if (vendorIds.length === 0) return [];
  const rows = await listContractorTasks(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorIds,
    statuses: input.openOnly
      ? ['assigned', 'acknowledged', 'in_progress', 'completion_submitted', 'resubmitted', 'rejected', 'rework_required', 'reopened']
      : null,
    limit: Math.min(Math.max(input.limit ?? 100, 1), 200),
  });
  const today = isoToday();
  return rows
    .filter((row) => vendorIds.includes(row.vendorId))
    .map((row) => toPortalTask(context, row, today));
}

export interface ContractorPortalTaskDetail {
  readonly task: ContractorPortalTask;
  readonly history: readonly TaskHistoryEntry[];
}

/** Contractor portal task detail; NotFound for tasks of other contractors (no existence oracle). */
export async function getContractorPortalTask(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly taskId: string },
): Promise<ContractorPortalTaskDetail> {
  const row = await findContractorTask(context.db, input.organizationId, input.taskId);
  if (!row) throw new NotFoundError('Task');
  if (
    !hasExternalScope(context, externalTarget(row), X.TASK_WORK) &&
    !hasExternalScope(context, externalTarget(row), X.TASK_REPORT)
  ) {
    throw new NotFoundError('Task');
  }
  const events = await listTaskExternalEvents(context.db, input.organizationId, input.taskId);
  return {
    task: toPortalTask(context, row, isoToday()),
    history: events.map((event) => ({
      id: event.id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      outcome: event.outcome,
      quality: event.quality,
      note: event.note,
      evidenceCount: event.evidenceCount,
      cycle: event.cycle,
      actorType: event.actorType,
      actorName: event.actorPrincipalId === context.principalId ? context.displayName : null,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

/** Counts for the contractor portal dashboard (Track R). */
export async function getContractorTaskSummary(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string | null },
): Promise<{ readonly open: number; readonly actionRequired: number; readonly overdue: number; readonly awaitingVerification: number }> {
  const tasks = await listContractorPortalTasks(context, { ...input, openOnly: true, limit: 200 });
  return {
    open: tasks.length,
    actionRequired: tasks.filter((task) => task.availableCommands.length > 0).length,
    overdue: tasks.filter((task) => task.overdue).length,
    awaitingVerification: tasks.filter((task) => task.status === 'completion_submitted' || task.status === 'resubmitted').length,
  };
}
