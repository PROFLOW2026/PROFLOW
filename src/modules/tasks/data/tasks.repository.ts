import { and, asc, desc, eq, inArray, or, sql, ilike, lte, gte } from 'drizzle-orm';
import {
  tasks,
  taskAssignees,
  taskChecklistItems,
  taskDependencies,
  taskActivity,
  taskComments,
  taskLabels,
  taskLabelAssignments,
  taskFollowers,
  taskRecurrenceRules,
  taskRecurrenceOccurrences,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  Task,
  TaskAssignee,
  TaskChecklistItem,
  TaskDependency,
  TaskActivity,
  TaskComment,
  TaskLabel,
  TaskDetail,
  TaskListFilters,
  TaskStatus,
  TaskPriority,
  TaskSource,
  TaskDependencyType,
  TaskActivityEventType,
  TaskRecurrenceRule,
  TaskRecurrenceOccurrence,
  TaskRecurrenceOccurrenceStatus,
} from '../domain/types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapTaskRow(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    boardId: row.boardId ?? null,
    bucketId: row.bucketId ?? null,
    projectId: row.projectId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    startDate: row.startDate ?? null,
    dueDate: row.dueDate ?? null,
    completionDate: row.completionDate ?? null,
    createdByOrgMemberId: row.createdByOrgMemberId ?? null,
    createdByEmployeeId: row.createdByEmployeeId ?? null,
    createdBySystem: row.createdBySystem,
    ownerOrgMemberId: row.ownerOrgMemberId ?? null,
    ownerEmployeeId: row.ownerEmployeeId ?? null,
    estimatedEffortMinutes: row.estimatedEffortMinutes ?? null,
    parentTaskId: row.parentTaskId ?? null,
    sortKey: row.sortKey,
    milestoneId: row.milestoneId ?? null,
    recurrenceRuleId: row.recurrenceRuleId ?? null,
    generatedFromOccurrenceId: row.generatedFromOccurrenceId ?? null,
    source: row.source as TaskSource,
    approvalRequired: row.approvalRequired,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ?? null,
    archivedByOrgMemberId: row.archivedByOrgMemberId ?? null,
    completedByOrgMemberId: row.completedByOrgMemberId ?? null,
    completedByEmployeeId: row.completedByEmployeeId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAssigneeRow(row: typeof taskAssignees.$inferSelect): TaskAssignee {
  return {
    id: row.id,
    taskId: row.taskId,
    organizationId: row.organizationId,
    orgMemberId: row.orgMemberId ?? null,
    employeeId: row.employeeId ?? null,
    assignedAt: row.assignedAt,
    assignedByOrgMemberId: row.assignedByOrgMemberId ?? null,
  };
}

function mapChecklistRow(row: typeof taskChecklistItems.$inferSelect): TaskChecklistItem {
  return {
    id: row.id,
    taskId: row.taskId,
    organizationId: row.organizationId,
    title: row.title,
    isDone: row.isDone,
    sortKey: row.sortKey,
    dueDate: row.dueDate ?? null,
    assigneeOrgMemberId: row.assigneeOrgMemberId ?? null,
    assigneeEmployeeId: row.assigneeEmployeeId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDependencyRow(row: typeof taskDependencies.$inferSelect): TaskDependency {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceTaskId: row.sourceTaskId,
    targetTaskId: row.targetTaskId,
    dependencyType: row.dependencyType as TaskDependencyType,
    createdAt: row.createdAt,
  };
}

function mapActivityRow(row: typeof taskActivity.$inferSelect): TaskActivity {
  return {
    id: row.id,
    taskId: row.taskId,
    organizationId: row.organizationId,
    actorOrgMemberId: row.actorOrgMemberId ?? null,
    actorEmployeeId: row.actorEmployeeId ?? null,
    actorSystem: row.actorSystem,
    eventType: row.eventType as TaskActivityEventType,
    payload: (row.payload as Record<string, unknown>) ?? null,
    createdAt: row.createdAt,
  };
}

function mapCommentRow(row: typeof taskComments.$inferSelect): TaskComment {
  return {
    id: row.id,
    taskId: row.taskId,
    organizationId: row.organizationId,
    authorOrgMemberId: row.authorOrgMemberId ?? null,
    authorEmployeeId: row.authorEmployeeId ?? null,
    body: row.body,
    isEdited: row.isEdited,
    editedAt: row.editedAt ?? null,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLabelRow(row: typeof taskLabels.$inferSelect): TaskLabel {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    color: row.color ?? null,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function insertTask(
  db: DbExecutor,
  input: {
    organizationId: string;
    workspaceId: string;
    title: string;
    description?: string | null;
    projectId?: string | null;
    boardId?: string | null;
    bucketId?: string | null;
    priority?: TaskPriority;
    startDate?: string | null;
    dueDate?: string | null;
    parentTaskId?: string | null;
    estimatedEffortMinutes?: number | null;
    milestoneId?: string | null;
    source?: TaskSource;
    approvalRequired?: boolean;
    sortKey: string;
    createdByOrgMemberId?: string | null;
    createdByEmployeeId?: string | null;
    createdBySystem?: boolean;
    recurrenceRuleId?: string | null;
    generatedFromOccurrenceId?: string | null;
  },
): Promise<Task> {
  const [row] = await db
    .insert(tasks)
    .values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      boardId: input.boardId ?? null,
      bucketId: input.bucketId ?? null,
      priority: input.priority ?? 'none',
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      parentTaskId: input.parentTaskId ?? null,
      estimatedEffortMinutes: input.estimatedEffortMinutes ?? null,
      milestoneId: input.milestoneId ?? null,
      source: input.source ?? 'manual',
      approvalRequired: input.approvalRequired ?? false,
      sortKey: input.sortKey,
      createdByOrgMemberId: input.createdByOrgMemberId ?? null,
      createdByEmployeeId: input.createdByEmployeeId ?? null,
      createdBySystem: input.createdBySystem ?? false,
      recurrenceRuleId: input.recurrenceRuleId ?? null,
      generatedFromOccurrenceId: input.generatedFromOccurrenceId ?? null,
    })
    .returning();
  return mapTaskRow(row!);
}

export async function findTaskById(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
): Promise<Task | null> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, organizationId)))
    .limit(1);
  return row ? mapTaskRow(row) : null;
}

export async function updateTaskById(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    startDate: string | null;
    dueDate: string | null;
    completionDate: string | null;
    bucketId: string | null;
    boardId: string | null;
    sortKey: string;
    estimatedEffortMinutes: number | null;
    milestoneId: string | null;
    approvalRequired: boolean;
    ownerOrgMemberId: string | null;
    ownerEmployeeId: string | null;
    isArchived: boolean;
    archivedAt: Date | null;
    archivedByOrgMemberId: string | null;
    completedByOrgMemberId: string | null;
    completedByEmployeeId: string | null;
  }>,
): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.organizationId, organizationId)))
    .returning();
  return row ? mapTaskRow(row) : null;
}

export async function listTasks(
  db: DbExecutor,
  organizationId: string,
  workspaceIds: string[],
  filters: TaskListFilters = {},
): Promise<Task[]> {
  if (workspaceIds.length === 0) return [];

  const conditions = [
    eq(tasks.organizationId, organizationId),
    inArray(tasks.workspaceId, workspaceIds),
  ];

  if (!filters.includeArchived) {
    conditions.push(eq(tasks.isArchived, false));
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(tasks.status, filters.status));
  }

  if (filters.priority && filters.priority !== 'all') {
    conditions.push(eq(tasks.priority, filters.priority));
  }

  if (filters.projectId) {
    conditions.push(eq(tasks.projectId, filters.projectId));
  }

  if (filters.boardId) {
    conditions.push(eq(tasks.boardId, filters.boardId));
  }

  if (filters.bucketId) {
    conditions.push(eq(tasks.bucketId, filters.bucketId));
  }

  if (filters.dueBefore) {
    conditions.push(lte(tasks.dueDate, filters.dueBefore));
  }

  if (filters.dueAfter) {
    conditions.push(gte(tasks.dueDate, filters.dueAfter));
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(ilike(tasks.title, term));
  }

  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.sortKey), desc(tasks.createdAt))
    .limit(limit)
    .offset(offset);

  // Filter by assignee if requested (join-based would be cleaner but this keeps the repo simple)
  let result = rows.map(mapTaskRow);

  if (filters.assigneeOrgMemberId || filters.assigneeEmployeeId) {
    const taskIds = result.map((t) => t.id);
    if (taskIds.length === 0) return [];

    const assigneeConditions = [inArray(taskAssignees.taskId, taskIds)];
    if (filters.assigneeOrgMemberId) {
      assigneeConditions.push(eq(taskAssignees.orgMemberId, filters.assigneeOrgMemberId));
    } else if (filters.assigneeEmployeeId) {
      assigneeConditions.push(eq(taskAssignees.employeeId, filters.assigneeEmployeeId));
    }

    const matchingAssignees = await db
      .select({ taskId: taskAssignees.taskId })
      .from(taskAssignees)
      .where(and(...assigneeConditions));

    const matchingTaskIds = new Set(matchingAssignees.map((a) => a.taskId));
    result = result.filter((t) => matchingTaskIds.has(t.id));
  }

  if (filters.labelId) {
    const taskIds = result.map((t) => t.id);
    if (taskIds.length === 0) return [];

    const matchingLabels = await db
      .select({ taskId: taskLabelAssignments.taskId })
      .from(taskLabelAssignments)
      .where(
        and(
          inArray(taskLabelAssignments.taskId, taskIds),
          eq(taskLabelAssignments.labelId, filters.labelId),
        ),
      );

    const matchingTaskIds = new Set(matchingLabels.map((l) => l.taskId));
    result = result.filter((t) => matchingTaskIds.has(t.id));
  }

  return result;
}

// ─── Task Detail ──────────────────────────────────────────────────────────────

export async function getTaskDetail(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
  options: { activityLimit?: number } = {},
): Promise<TaskDetail | null> {
  const task = await findTaskById(db, organizationId, taskId);
  if (!task) return null;

  const activityLimit = options.activityLimit ?? 20;

  const [assignees, checklistItems, labelRows, recentActivity, commentCountRow] = await Promise.all([
    db
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId))
      .then((rows) => rows.map(mapAssigneeRow)),

    db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(asc(taskChecklistItems.sortKey))
      .then((rows) => rows.map(mapChecklistRow)),

    db
      .select({ label: taskLabels })
      .from(taskLabelAssignments)
      .innerJoin(taskLabels, eq(taskLabelAssignments.labelId, taskLabels.id))
      .where(eq(taskLabelAssignments.taskId, taskId))
      .then((rows) => rows.map((r) => mapLabelRow(r.label))),

    db
      .select()
      .from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(desc(taskActivity.createdAt))
      .limit(activityLimit)
      .then((rows) => rows.map(mapActivityRow)),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(taskComments)
      .where(and(eq(taskComments.taskId, taskId), eq(taskComments.isDeleted, false))),
  ]);

  return {
    ...task,
    assignees,
    checklistItems,
    labels: labelRows,
    recentActivity,
    commentCount: commentCountRow[0]?.count ?? 0,
  };
}

// ─── Assignees ────────────────────────────────────────────────────────────────

export async function insertTaskAssignee(
  db: DbExecutor,
  input: {
    taskId: string;
    organizationId: string;
    orgMemberId?: string | null;
    employeeId?: string | null;
    assignedByOrgMemberId?: string | null;
  },
): Promise<TaskAssignee> {
  const [row] = await db
    .insert(taskAssignees)
    .values({
      taskId: input.taskId,
      organizationId: input.organizationId,
      orgMemberId: input.orgMemberId ?? null,
      employeeId: input.employeeId ?? null,
      assignedByOrgMemberId: input.assignedByOrgMemberId ?? null,
    })
    .returning();
  return mapAssigneeRow(row!);
}

export async function deleteTaskAssignee(
  db: DbExecutor,
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<void> {
  const conditions = [eq(taskAssignees.taskId, taskId)];
  if (actor.orgMemberId) {
    conditions.push(eq(taskAssignees.orgMemberId, actor.orgMemberId));
  } else if (actor.employeeId) {
    conditions.push(eq(taskAssignees.employeeId, actor.employeeId));
  }
  await db.delete(taskAssignees).where(and(...conditions));
}

export async function findTaskAssignee(
  db: DbExecutor,
  taskId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<TaskAssignee | null> {
  const conditions = [eq(taskAssignees.taskId, taskId)];
  if (actor.orgMemberId) {
    conditions.push(eq(taskAssignees.orgMemberId, actor.orgMemberId));
  } else if (actor.employeeId) {
    conditions.push(eq(taskAssignees.employeeId, actor.employeeId));
  }
  const [row] = await db
    .select()
    .from(taskAssignees)
    .where(and(...conditions))
    .limit(1);
  return row ? mapAssigneeRow(row) : null;
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export async function insertChecklistItem(
  db: DbExecutor,
  input: {
    taskId: string;
    organizationId: string;
    title: string;
    sortKey: string;
    dueDate?: string | null;
    assigneeOrgMemberId?: string | null;
    assigneeEmployeeId?: string | null;
  },
): Promise<TaskChecklistItem> {
  const [row] = await db
    .insert(taskChecklistItems)
    .values({
      taskId: input.taskId,
      organizationId: input.organizationId,
      title: input.title,
      sortKey: input.sortKey,
      dueDate: input.dueDate ?? null,
      assigneeOrgMemberId: input.assigneeOrgMemberId ?? null,
      assigneeEmployeeId: input.assigneeEmployeeId ?? null,
    })
    .returning();
  return mapChecklistRow(row!);
}

export async function updateChecklistItem(
  db: DbExecutor,
  itemId: string,
  organizationId: string,
  patch: Partial<{ title: string; isDone: boolean; sortKey: string; dueDate: string | null }>,
): Promise<TaskChecklistItem | null> {
  const [row] = await db
    .update(taskChecklistItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(taskChecklistItems.id, itemId), eq(taskChecklistItems.organizationId, organizationId)),
    )
    .returning();
  return row ? mapChecklistRow(row) : null;
}

export async function deleteChecklistItem(
  db: DbExecutor,
  itemId: string,
  organizationId: string,
): Promise<void> {
  await db
    .delete(taskChecklistItems)
    .where(
      and(eq(taskChecklistItems.id, itemId), eq(taskChecklistItems.organizationId, organizationId)),
    );
}

export async function listChecklistItems(
  db: DbExecutor,
  taskId: string,
): Promise<TaskChecklistItem[]> {
  const rows = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(asc(taskChecklistItems.sortKey));
  return rows.map(mapChecklistRow);
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export async function insertTaskDependency(
  db: DbExecutor,
  input: {
    organizationId: string;
    sourceTaskId: string;
    targetTaskId: string;
    dependencyType: TaskDependencyType;
  },
): Promise<TaskDependency> {
  const [row] = await db
    .insert(taskDependencies)
    .values({
      organizationId: input.organizationId,
      sourceTaskId: input.sourceTaskId,
      targetTaskId: input.targetTaskId,
      dependencyType: input.dependencyType,
    })
    .returning();
  return mapDependencyRow(row!);
}

export async function deleteTaskDependency(
  db: DbExecutor,
  sourceTaskId: string,
  targetTaskId: string,
  organizationId: string,
): Promise<void> {
  await db
    .delete(taskDependencies)
    .where(
      and(
        eq(taskDependencies.sourceTaskId, sourceTaskId),
        eq(taskDependencies.targetTaskId, targetTaskId),
        eq(taskDependencies.organizationId, organizationId),
      ),
    );
}

export async function listTaskDependencies(
  db: DbExecutor,
  organizationId: string,
  taskIds: string[],
): Promise<TaskDependency[]> {
  if (taskIds.length === 0) return [];
  const rows = await db
    .select()
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.organizationId, organizationId),
        or(
          inArray(taskDependencies.sourceTaskId, taskIds),
          inArray(taskDependencies.targetTaskId, taskIds),
        )!,
      ),
    );
  return rows.map(mapDependencyRow);
}

// ─── Activity ────────────────────────────────────────────────────────────────

export async function insertTaskActivity(
  db: DbExecutor,
  input: {
    taskId: string;
    organizationId: string;
    actorOrgMemberId?: string | null;
    actorEmployeeId?: string | null;
    actorSystem?: boolean;
    eventType: TaskActivityEventType;
    payload?: Record<string, unknown> | null;
  },
): Promise<TaskActivity> {
  const [row] = await db
    .insert(taskActivity)
    .values({
      taskId: input.taskId,
      organizationId: input.organizationId,
      actorOrgMemberId: input.actorOrgMemberId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      actorSystem: input.actorSystem ?? false,
      eventType: input.eventType,
      payload: input.payload ?? null,
    })
    .returning();
  return mapActivityRow(row!);
}

export async function listTaskActivity(
  db: DbExecutor,
  taskId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<TaskActivity[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskId, taskId))
    .orderBy(asc(taskActivity.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapActivityRow);
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function insertTaskComment(
  db: DbExecutor,
  input: {
    taskId: string;
    organizationId: string;
    authorOrgMemberId?: string | null;
    authorEmployeeId?: string | null;
    body: string;
  },
): Promise<TaskComment> {
  const [row] = await db
    .insert(taskComments)
    .values({
      taskId: input.taskId,
      organizationId: input.organizationId,
      authorOrgMemberId: input.authorOrgMemberId ?? null,
      authorEmployeeId: input.authorEmployeeId ?? null,
      body: input.body,
    })
    .returning();
  return mapCommentRow(row!);
}

export async function listTaskComments(
  db: DbExecutor,
  taskId: string,
  options: { limit?: number; offset?: number; includeDeleted?: boolean } = {},
): Promise<TaskComment[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  const conditions = [eq(taskComments.taskId, taskId)];
  if (!options.includeDeleted) {
    conditions.push(eq(taskComments.isDeleted, false));
  }

  const rows = await db
    .select()
    .from(taskComments)
    .where(and(...conditions))
    .orderBy(asc(taskComments.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapCommentRow);
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export async function findLabelById(
  db: DbExecutor,
  organizationId: string,
  labelId: string,
): Promise<TaskLabel | null> {
  const [row] = await db
    .select()
    .from(taskLabels)
    .where(and(eq(taskLabels.id, labelId), eq(taskLabels.organizationId, organizationId)))
    .limit(1);
  return row ? mapLabelRow(row) : null;
}

export async function insertLabelAssignment(
  db: DbExecutor,
  input: { taskId: string; labelId: string; organizationId: string },
): Promise<void> {
  await db
    .insert(taskLabelAssignments)
    .values({ taskId: input.taskId, labelId: input.labelId, organizationId: input.organizationId })
    .onConflictDoNothing();
}

export async function deleteLabelAssignment(
  db: DbExecutor,
  taskId: string,
  labelId: string,
): Promise<void> {
  await db
    .delete(taskLabelAssignments)
    .where(
      and(eq(taskLabelAssignments.taskId, taskId), eq(taskLabelAssignments.labelId, labelId)),
    );
}

export async function listOrgLabels(
  db: DbExecutor,
  organizationId: string,
  includeArchived = false,
): Promise<TaskLabel[]> {
  const conditions = [eq(taskLabels.organizationId, organizationId)];
  if (!includeArchived) {
    conditions.push(eq(taskLabels.isArchived, false));
  }
  const rows = await db.select().from(taskLabels).where(and(...conditions));
  return rows.map(mapLabelRow);
}

// ─── Followers ────────────────────────────────────────────────────────────────

export async function upsertTaskFollower(
  db: DbExecutor,
  input: { taskId: string; organizationId: string; orgMemberId: string },
): Promise<void> {
  await db
    .insert(taskFollowers)
    .values({
      taskId: input.taskId,
      organizationId: input.organizationId,
      orgMemberId: input.orgMemberId,
    })
    .onConflictDoNothing();
}

export async function deleteTaskFollower(
  db: DbExecutor,
  taskId: string,
  orgMemberId: string,
): Promise<void> {
  await db
    .delete(taskFollowers)
    .where(
      and(eq(taskFollowers.taskId, taskId), eq(taskFollowers.orgMemberId, orgMemberId)),
    );
}

// ─── Recurrence ───────────────────────────────────────────────────────────────

function mapRecurrenceRuleRow(row: typeof taskRecurrenceRules.$inferSelect): TaskRecurrenceRule {
  return {
    id: row.id,
    organizationId: row.organizationId,
    rrule: row.rrule,
    timezone: row.timezone,
    startsAt: row.startsAt,
    endsAt: row.endsAt ?? null,
    maxOccurrences: row.maxOccurrences ?? null,
    templateTaskId: row.templateTaskId ?? null,
    isActive: row.isActive,
    createdByOrgMemberId: row.createdByOrgMemberId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOccurrenceRow(
  row: typeof taskRecurrenceOccurrences.$inferSelect,
): TaskRecurrenceOccurrence {
  return {
    id: row.id,
    ruleId: row.ruleId,
    organizationId: row.organizationId,
    occurrenceAt: row.occurrenceAt,
    status: row.status as TaskRecurrenceOccurrenceStatus,
    generatedTaskId: row.generatedTaskId ?? null,
  };
}

export async function findActiveRecurrenceRules(
  db: DbExecutor,
  organizationId: string,
): Promise<TaskRecurrenceRule[]> {
  const rows = await db
    .select()
    .from(taskRecurrenceRules)
    .where(
      and(
        eq(taskRecurrenceRules.organizationId, organizationId),
        eq(taskRecurrenceRules.isActive, true),
      ),
    );
  return rows.map(mapRecurrenceRuleRow);
}

export async function listExistingOccurrences(
  db: DbExecutor,
  ruleId: string,
  from: Date,
  to: Date,
): Promise<TaskRecurrenceOccurrence[]> {
  const rows = await db
    .select()
    .from(taskRecurrenceOccurrences)
    .where(
      and(
        eq(taskRecurrenceOccurrences.ruleId, ruleId),
        gte(taskRecurrenceOccurrences.occurrenceAt, from),
        lte(taskRecurrenceOccurrences.occurrenceAt, to),
      ),
    );
  return rows.map(mapOccurrenceRow);
}

export async function insertOccurrence(
  db: DbExecutor,
  input: {
    ruleId: string;
    organizationId: string;
    occurrenceAt: Date;
    status?: TaskRecurrenceOccurrenceStatus;
    generatedTaskId?: string | null;
  },
): Promise<TaskRecurrenceOccurrence | null> {
  const rows = await db
    .insert(taskRecurrenceOccurrences)
    .values({
      ruleId: input.ruleId,
      organizationId: input.organizationId,
      occurrenceAt: input.occurrenceAt,
      status: input.status ?? 'pending',
      generatedTaskId: input.generatedTaskId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return rows[0] ? mapOccurrenceRow(rows[0]) : null;
}

export async function updateOccurrenceStatus(
  db: DbExecutor,
  occurrenceId: string,
  status: TaskRecurrenceOccurrenceStatus,
  generatedTaskId?: string | null,
): Promise<void> {
  await db
    .update(taskRecurrenceOccurrences)
    .set({
      status,
      ...(generatedTaskId !== undefined ? { generatedTaskId } : {}),
    })
    .where(eq(taskRecurrenceOccurrences.id, occurrenceId));
}
