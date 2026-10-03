import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  collabComments,
  entityLinks,
  externalPrincipals,
  profiles,
  projectLocations,
  taskExternalAssignments,
  taskExternalEvents,
  tasks,
  vendors,
} from '@drizzle/schema';
import { actorColumns, type Actor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ExternalTaskEventAction,
  ExternalTaskStatus,
  QualityAssessment,
  VerificationOutcome,
} from '../domain/task-lifecycle';
import type { DiscussionAudience, DiscussionKind } from '../domain/discussion';

// ─── Contractor assignments ──────────────────────────────────────────────────

export type TaskExternalAssignmentRow = typeof taskExternalAssignments.$inferSelect;

export async function findTaskExternalAssignment(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
): Promise<TaskExternalAssignmentRow | null> {
  const [row] = await db
    .select()
    .from(taskExternalAssignments)
    .where(
      and(eq(taskExternalAssignments.organizationId, organizationId), eq(taskExternalAssignments.taskId, taskId)),
    )
    .limit(1);
  return row ?? null;
}

export async function insertTaskExternalAssignment(
  db: DbExecutor,
  values: typeof taskExternalAssignments.$inferInsert,
): Promise<void> {
  await db.insert(taskExternalAssignments).values(values);
}

export async function updateTaskExternalAssignment(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
  expectedStatus: ExternalTaskStatus,
  patch: Partial<typeof taskExternalAssignments.$inferInsert>,
): Promise<boolean> {
  const rows = await db
    .update(taskExternalAssignments)
    .set(patch)
    .where(
      and(
        eq(taskExternalAssignments.organizationId, organizationId),
        eq(taskExternalAssignments.taskId, taskId),
        eq(taskExternalAssignments.status, expectedStatus),
      ),
    )
    .returning({ taskId: taskExternalAssignments.taskId });
  return rows.length === 1;
}

export interface InsertTaskEventInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly action: ExternalTaskEventAction;
  readonly fromStatus: ExternalTaskStatus | null;
  readonly toStatus: ExternalTaskStatus;
  readonly outcome?: VerificationOutcome | null;
  readonly quality?: QualityAssessment | null;
  readonly note?: string | null;
  readonly evidenceCount?: number | null;
  readonly cycle: number;
  readonly actor: Actor;
}

export async function insertTaskExternalEvent(db: DbExecutor, input: InsertTaskEventInput): Promise<void> {
  const actor = actorColumns(input.actor);
  await db.insert(taskExternalEvents).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    taskId: input.taskId,
    action: input.action,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    outcome: input.outcome ?? null,
    quality: input.quality ?? null,
    note: input.note ?? null,
    evidenceCount: input.evidenceCount ?? null,
    cycle: input.cycle,
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorPrincipalId: actor.actorPrincipalId,
  });
}

export type TaskExternalEventRow = typeof taskExternalEvents.$inferSelect;

export async function listTaskExternalEvents(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
): Promise<TaskExternalEventRow[]> {
  return db
    .select()
    .from(taskExternalEvents)
    .where(and(eq(taskExternalEvents.organizationId, organizationId), eq(taskExternalEvents.taskId, taskId)))
    .orderBy(asc(taskExternalEvents.createdAt), asc(taskExternalEvents.id))
    .limit(500);
}

/** Operational task projection shared by the internal panel and the contractor portal (no money exists on tasks). */
export interface ContractorTaskRow {
  readonly taskId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly priority: string;
  readonly taskStatus: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly principalId: string | null;
  readonly status: ExternalTaskStatus;
  readonly requiresEvidence: boolean;
  readonly cycle: number;
  readonly lastOutcome: VerificationOutcome | null;
  readonly lastQuality: QualityAssessment | null;
  readonly lastSubmittedEvidenceCount: number | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly workPackageId: string | null;
  readonly subcontractWorkLineId: string | null;
  readonly submittedAt: Date | null;
  readonly updatedAt: Date;
}

const contractorTaskColumns = {
  taskId: taskExternalAssignments.taskId,
  organizationId: taskExternalAssignments.organizationId,
  projectId: taskExternalAssignments.projectId,
  title: tasks.title,
  description: tasks.description,
  dueDate: tasks.dueDate,
  priority: tasks.priority,
  taskStatus: tasks.status,
  vendorId: taskExternalAssignments.vendorId,
  subcontractAgreementId: taskExternalAssignments.subcontractAgreementId,
  principalId: taskExternalAssignments.principalId,
  status: taskExternalAssignments.status,
  requiresEvidence: taskExternalAssignments.requiresEvidence,
  cycle: taskExternalAssignments.cycle,
  lastOutcome: taskExternalAssignments.lastOutcome,
  lastQuality: taskExternalAssignments.lastQuality,
  lastSubmittedEvidenceCount: taskExternalAssignments.lastSubmittedEvidenceCount,
  locationId: taskExternalAssignments.locationId,
  locationName: projectLocations.name,
  workPackageId: taskExternalAssignments.workPackageId,
  subcontractWorkLineId: taskExternalAssignments.subcontractWorkLineId,
  submittedAt: taskExternalAssignments.submittedAt,
  updatedAt: taskExternalAssignments.updatedAt,
};

function contractorTaskQuery(db: DbExecutor) {
  return db
    .select(contractorTaskColumns)
    .from(taskExternalAssignments)
    .innerJoin(
      tasks,
      and(eq(tasks.id, taskExternalAssignments.taskId), eq(tasks.organizationId, taskExternalAssignments.organizationId)),
    )
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, taskExternalAssignments.locationId),
        eq(projectLocations.organizationId, taskExternalAssignments.organizationId),
      ),
    );
}

export async function findContractorTask(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
): Promise<ContractorTaskRow | null> {
  const [row] = await contractorTaskQuery(db)
    .where(
      and(eq(taskExternalAssignments.organizationId, organizationId), eq(taskExternalAssignments.taskId, taskId)),
    )
    .limit(1);
  return (row as ContractorTaskRow | undefined) ?? null;
}

export interface ListContractorTasksFilter {
  readonly organizationId: string;
  /** null = every project (contractor portal dashboard). */
  readonly projectId: string | null;
  /** Restricts to these vendors (external callers pass their grant vendors; RLS enforces again). */
  readonly vendorIds?: readonly string[] | null;
  readonly statuses?: readonly ExternalTaskStatus[] | null;
  readonly limit: number;
}

export async function listContractorTasks(db: DbExecutor, filter: ListContractorTasksFilter): Promise<ContractorTaskRow[]> {
  const conditions: SQL[] = [
    eq(taskExternalAssignments.organizationId, filter.organizationId),
    eq(tasks.isArchived, false),
  ];
  if (filter.projectId) conditions.push(eq(taskExternalAssignments.projectId, filter.projectId));
  if (filter.vendorIds) {
    if (filter.vendorIds.length === 0) return [];
    conditions.push(inArray(taskExternalAssignments.vendorId, [...filter.vendorIds]));
  }
  if (filter.statuses && filter.statuses.length > 0) {
    conditions.push(inArray(taskExternalAssignments.status, [...filter.statuses]));
  }
  const rows = await contractorTaskQuery(db)
    .where(and(...conditions))
    .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(taskExternalAssignments.updatedAt))
    .limit(filter.limit);
  return rows as ContractorTaskRow[];
}

// ─── Entity links ────────────────────────────────────────────────────────────

export interface InsertEntityLinkInput {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly relation: string;
  readonly actor: Actor;
}

export async function insertEntityLink(db: DbExecutor, input: InsertEntityLinkInput): Promise<void> {
  const actor = actorColumns(input.actor);
  await db
    .insert(entityLinks)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      relation: input.relation,
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorPrincipalId: actor.actorPrincipalId,
    })
    .onConflictDoNothing();
}

export interface TaskLinkRow {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly relation: string;
  readonly direction: 'source' | 'target';
}

/** Links where the task is either end (internal readers only; RLS denies externals). */
export async function listTaskEntityLinks(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
): Promise<TaskLinkRow[]> {
  const rows = await db
    .select()
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.organizationId, organizationId),
        or(
          and(eq(entityLinks.targetType, 'task'), eq(entityLinks.targetId, taskId)),
          and(eq(entityLinks.sourceType, 'task'), eq(entityLinks.sourceId, taskId)),
        ),
      ),
    )
    .orderBy(asc(entityLinks.createdAt))
    .limit(200);
  return rows.map((row) =>
    row.targetType === 'task' && row.targetId === taskId
      ? { id: row.id, entityType: row.sourceType, entityId: row.sourceId, relation: row.relation, direction: 'source' as const }
      : { id: row.id, entityType: row.targetType, entityId: row.targetId, relation: row.relation, direction: 'target' as const },
  );
}

// ─── Comments ────────────────────────────────────────────────────────────────

export interface InsertCommentInput {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly audience: DiscussionAudience;
  readonly kind: DiscussionKind;
  readonly body: string;
  readonly actor: Actor;
}

/** No RETURNING: an external principal may append a post it could not necessarily re-read. */
export async function insertCollabComment(db: DbExecutor, input: InsertCommentInput): Promise<void> {
  const actor = actorColumns(input.actor);
  await db.insert(collabComments).values({
    id: input.id,
    organizationId: input.organizationId,
    projectId: input.projectId,
    entityType: input.entityType,
    entityId: input.entityId,
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId,
    audience: input.audience,
    kind: input.kind,
    body: input.body,
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorPrincipalId: actor.actorPrincipalId,
  });
}

export type CollabCommentRow = typeof collabComments.$inferSelect;

export interface ListCommentsFilter {
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  /** External viewers: contractor audience only, vendor-less or own vendors. */
  readonly externalVendorIds?: readonly string[] | null;
  readonly limit: number;
}

export async function listCollabComments(db: DbExecutor, filter: ListCommentsFilter): Promise<CollabCommentRow[]> {
  const conditions: SQL[] = [
    eq(collabComments.organizationId, filter.organizationId),
    eq(collabComments.entityType, filter.entityType),
    eq(collabComments.entityId, filter.entityId),
  ];
  if (filter.externalVendorIds) {
    conditions.push(eq(collabComments.audience, 'contractor'));
    const vendorCondition =
      filter.externalVendorIds.length > 0
        ? or(isNull(collabComments.vendorId), inArray(collabComments.vendorId, [...filter.externalVendorIds]))
        : isNull(collabComments.vendorId);
    conditions.push(vendorCondition!);
  }
  const rows = await db
    .select()
    .from(collabComments)
    .where(and(...conditions))
    .orderBy(desc(collabComments.createdAt), desc(collabComments.id))
    .limit(filter.limit);
  return rows.reverse();
}

// ─── Display names (batched, RLS-bound) ──────────────────────────────────────

export async function loadProfileNames(db: DbExecutor, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: profiles.id, displayName: profiles.displayName, email: profiles.email })
    .from(profiles)
    .where(inArray(profiles.id, unique));
  return new Map(rows.map((row) => [row.id, row.displayName ?? row.email]));
}

export async function loadPrincipalNames(db: DbExecutor, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: externalPrincipals.id, displayName: externalPrincipals.displayName })
    .from(externalPrincipals)
    .where(inArray(externalPrincipals.id, unique));
  return new Map(rows.filter((row) => row.displayName).map((row) => [row.id, row.displayName!]));
}

export async function loadVendorNames(
  db: DbExecutor,
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), inArray(vendors.id, unique)));
  return new Map(rows.map((row) => [row.id, row.name]));
}
