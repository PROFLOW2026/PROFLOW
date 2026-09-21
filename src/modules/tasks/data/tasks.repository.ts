import { and, asc, desc, eq, inArray, or, sql, ilike, lte, gte, lt } from 'drizzle-orm';
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
  taskReminders,
  taskTemplates,
  taskTemplateItems,
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
  TaskReminder,
  TaskReminderType,
  TaskLinkSummary,
  TaskDependencyView,
  TaskSubtaskView,
  TaskTemplateSummary,
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

  const [
    assignees,
    checklistItems,
    labelRows,
    recentActivity,
    commentCountRow,
    dependencyRows,
    subtaskRows,
    parentRow,
  ] = await Promise.all([
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

    listTaskDependencies(db, organizationId, [taskId]),

    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.parentTaskId, taskId),
          eq(tasks.isArchived, false),
        ),
      )
      .orderBy(asc(tasks.sortKey), asc(tasks.createdAt)),

    task.parentTaskId
      ? db
          .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
          .from(tasks)
          .where(
            and(eq(tasks.id, task.parentTaskId), eq(tasks.organizationId, organizationId)),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const linkedTaskIds = new Set<string>();
  for (const dep of dependencyRows) {
    if (dep.sourceTaskId === taskId) linkedTaskIds.add(dep.targetTaskId);
    if (dep.targetTaskId === taskId) linkedTaskIds.add(dep.sourceTaskId);
  }

  const titleById = new Map<string, string>();
  if (linkedTaskIds.size > 0) {
    const titleRows = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          inArray(tasks.id, Array.from(linkedTaskIds)),
        ),
      );
    for (const row of titleRows) {
      titleById.set(row.id, row.title);
    }
  }

  const dependsOn: TaskDependencyView[] = [];
  const blockedBy: TaskDependencyView[] = [];
  const blocks: TaskDependencyView[] = [];

  for (const dep of dependencyRows) {
    if (dep.sourceTaskId === taskId) {
      const view: TaskDependencyView = {
        id: dep.id,
        taskId: dep.targetTaskId,
        taskTitle: titleById.get(dep.targetTaskId) ?? dep.targetTaskId,
        dependencyType: dep.dependencyType,
      };
      if (dep.dependencyType === 'blocked_by') {
        blockedBy.push(view);
      } else {
        dependsOn.push(view);
      }
    }
    if (dep.targetTaskId === taskId) {
      blocks.push({
        id: dep.id,
        taskId: dep.sourceTaskId,
        taskTitle: titleById.get(dep.sourceTaskId) ?? dep.sourceTaskId,
        dependencyType: dep.dependencyType,
      });
    }
  }

  const subtaskIds = subtaskRows.map((row) => row.id);
  const assigneeCounts = new Map<string, number>();
  if (subtaskIds.length > 0) {
    const countRows = await db
      .select({
        taskId: taskAssignees.taskId,
        count: sql<number>`count(*)::int`,
      })
      .from(taskAssignees)
      .where(inArray(taskAssignees.taskId, subtaskIds))
      .groupBy(taskAssignees.taskId);
    for (const row of countRows) {
      assigneeCounts.set(row.taskId, row.count);
    }
  }

  const subtasks: TaskSubtaskView[] = subtaskRows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status as TaskSubtaskView['status'],
    dueDate: row.dueDate ?? null,
    assigneeCount: assigneeCounts.get(row.id) ?? 0,
  }));

  const parentTask: TaskLinkSummary | null = parentRow[0]
    ? {
        id: parentRow[0].id,
        title: parentRow[0].title,
        status: parentRow[0].status as TaskLinkSummary['status'],
        dueDate: parentRow[0].dueDate ?? null,
      }
    : null;

  return {
    ...task,
    assignees,
    checklistItems,
    labels: labelRows,
    recentActivity,
    commentCount: commentCountRow[0]?.count ?? 0,
    parentTask,
    subtasks,
    dependsOn,
    blockedBy,
    blocks,
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

export async function findTaskCommentById(
  db: DbExecutor,
  organizationId: string,
  commentId: string,
): Promise<TaskComment | null> {
  const [row] = await db
    .select()
    .from(taskComments)
    .where(and(eq(taskComments.id, commentId), eq(taskComments.organizationId, organizationId)))
    .limit(1);

  return row ? mapCommentRow(row) : null;
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

export async function findRecurrenceRuleByTemplateTaskId(
  db: DbExecutor,
  organizationId: string,
  templateTaskId: string,
): Promise<TaskRecurrenceRule | null> {
  const [row] = await db
    .select()
    .from(taskRecurrenceRules)
    .where(
      and(
        eq(taskRecurrenceRules.organizationId, organizationId),
        eq(taskRecurrenceRules.templateTaskId, templateTaskId),
      ),
    )
    .limit(1);
  return row ? mapRecurrenceRuleRow(row) : null;
}

export async function upsertRecurrenceRule(
  db: DbExecutor,
  input: {
    organizationId: string;
    templateTaskId: string;
    rrule: string;
    timezone: string;
    startsAt: Date;
    endsAt?: Date | null;
    maxOccurrences?: number | null;
    isActive: boolean;
    createdByOrgMemberId?: string | null;
  },
): Promise<TaskRecurrenceRule> {
  const existing = await findRecurrenceRuleByTemplateTaskId(
    db,
    input.organizationId,
    input.templateTaskId,
  );

  if (existing) {
    const [row] = await db
      .update(taskRecurrenceRules)
      .set({
        rrule: input.rrule,
        timezone: input.timezone,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        maxOccurrences: input.maxOccurrences ?? null,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(taskRecurrenceRules.id, existing.id))
      .returning();
    return mapRecurrenceRuleRow(row!);
  }

  const [row] = await db
    .insert(taskRecurrenceRules)
    .values({
      organizationId: input.organizationId,
      templateTaskId: input.templateTaskId,
      rrule: input.rrule,
      timezone: input.timezone,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      maxOccurrences: input.maxOccurrences ?? null,
      isActive: input.isActive,
      createdByOrgMemberId: input.createdByOrgMemberId ?? null,
    })
    .returning();
  return mapRecurrenceRuleRow(row!);
}

export async function deactivateRecurrenceRule(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
): Promise<void> {
  await db
    .update(taskRecurrenceRules)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(eq(taskRecurrenceRules.id, ruleId), eq(taskRecurrenceRules.organizationId, organizationId)),
    );
}

export async function listPendingOccurrencesDue(
  db: DbExecutor,
  organizationId: string,
  before: Date,
  cap: number,
): Promise<TaskRecurrenceOccurrence[]> {
  const rows = await db
    .select()
    .from(taskRecurrenceOccurrences)
    .where(
      and(
        eq(taskRecurrenceOccurrences.organizationId, organizationId),
        eq(taskRecurrenceOccurrences.status, 'pending'),
        lte(taskRecurrenceOccurrences.occurrenceAt, before),
      ),
    )
    .limit(cap);
  return rows.map(mapOccurrenceRow);
}

export async function findRecurrenceRuleById(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
): Promise<TaskRecurrenceRule | null> {
  const [row] = await db
    .select()
    .from(taskRecurrenceRules)
    .where(
      and(eq(taskRecurrenceRules.id, ruleId), eq(taskRecurrenceRules.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapRecurrenceRuleRow(row) : null;
}

function mapReminderRow(row: typeof taskReminders.$inferSelect): TaskReminder {
  return {
    id: row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    reminderType: row.reminderType as TaskReminderType,
    remindAt: row.remindAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTaskReminders(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
): Promise<TaskReminder[]> {
  const rows = await db
    .select()
    .from(taskReminders)
    .where(
      and(eq(taskReminders.organizationId, organizationId), eq(taskReminders.taskId, taskId)),
    );
  return rows.map(mapReminderRow);
}

export async function upsertTaskReminder(
  db: DbExecutor,
  input: {
    organizationId: string;
    taskId: string;
    reminderType: TaskReminderType;
    remindAt: Date;
  },
): Promise<TaskReminder> {
  const [row] = await db
    .insert(taskReminders)
    .values({
      organizationId: input.organizationId,
      taskId: input.taskId,
      reminderType: input.reminderType,
      remindAt: input.remindAt,
    })
    .onConflictDoUpdate({
      target: [taskReminders.taskId, taskReminders.reminderType],
      set: {
        remindAt: input.remindAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return mapReminderRow(row!);
}

export async function deleteTaskReminder(
  db: DbExecutor,
  organizationId: string,
  taskId: string,
  reminderType: TaskReminderType,
): Promise<void> {
  await db
    .delete(taskReminders)
    .where(
      and(
        eq(taskReminders.organizationId, organizationId),
        eq(taskReminders.taskId, taskId),
        eq(taskReminders.reminderType, reminderType),
      ),
    );
}

export async function listDueTaskReminders(
  db: DbExecutor,
  organizationId: string,
  before: Date,
  cap: number,
): Promise<(TaskReminder & { taskTitle: string; assigneeUserIds: string[] })[]> {
  const rows = await db
    .select({
      reminder: taskReminders,
      taskTitle: tasks.title,
    })
    .from(taskReminders)
    .innerJoin(tasks, eq(taskReminders.taskId, tasks.id))
    .where(
      and(
        eq(taskReminders.organizationId, organizationId),
        lte(taskReminders.remindAt, before),
        eq(tasks.isArchived, false),
        sql`${tasks.status} NOT IN ('done', 'cancelled')`,
      ),
    )
    .limit(cap);

  return rows.map((row) => ({
    ...mapReminderRow(row.reminder),
    taskTitle: row.taskTitle,
    assigneeUserIds: [],
  }));
}

export async function listOverdueUwmTasks(
  db: DbExecutor,
  organizationId: string,
  today: string,
  cap: number,
): Promise<
  {
    id: string;
    title: string;
    dueDate: string;
    projectId: string | null;
    workspaceId: string;
  }[]
> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.isArchived, false),
        sql`${tasks.status} NOT IN ('done', 'cancelled')`,
        sql`${tasks.dueDate} IS NOT NULL`,
        lt(tasks.dueDate, today),
      ),
    )
    .limit(cap);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueDate: row.dueDate!,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
  }));
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function insertTaskTemplate(
  db: DbExecutor,
  input: {
    organizationId: string;
    title: string;
    description?: string | null;
    priority?: TaskPriority;
  },
): Promise<{ id: string; title: string }> {
  const [row] = await db
    .insert(taskTemplates)
    .values({
      organizationId: input.organizationId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'none',
    })
    .returning({ id: taskTemplates.id, title: taskTemplates.title });
  return row!;
}

export async function insertTaskTemplateItems(
  db: DbExecutor,
  items: Array<{
    templateId: string;
    organizationId: string;
    title: string;
    description?: string | null;
    sortKey: string;
  }>,
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(taskTemplateItems).values(
    items.map((item) => ({
      templateId: item.templateId,
      organizationId: item.organizationId,
      title: item.title,
      description: item.description ?? null,
      sortKey: item.sortKey,
    })),
  );
}

export async function findTaskTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<{ id: string; title: string; description: string | null; priority: TaskPriority } | null> {
  const [row] = await db
    .select({
      id: taskTemplates.id,
      title: taskTemplates.title,
      description: taskTemplates.description,
      priority: taskTemplates.priority,
    })
    .from(taskTemplates)
    .where(
      and(
        eq(taskTemplates.id, templateId),
        eq(taskTemplates.organizationId, organizationId),
        eq(taskTemplates.isArchived, false),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority as TaskPriority,
  };
}

export async function listTaskTemplateItems(
  db: DbExecutor,
  templateId: string,
): Promise<Array<{ id: string; title: string; description: string | null; sortKey: string }>> {
  const rows = await db
    .select({
      id: taskTemplateItems.id,
      title: taskTemplateItems.title,
      description: taskTemplateItems.description,
      sortKey: taskTemplateItems.sortKey,
    })
    .from(taskTemplateItems)
    .where(eq(taskTemplateItems.templateId, templateId))
    .orderBy(asc(taskTemplateItems.sortKey));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    sortKey: row.sortKey,
  }));
}

export async function listActiveTaskTemplates(
  db: DbExecutor,
  organizationId: string,
): Promise<TaskTemplateSummary[]> {
  const rows = await db
    .select({
      id: taskTemplates.id,
      title: taskTemplates.title,
      description: taskTemplates.description,
      priority: taskTemplates.priority,
      itemCount: sql<number>`count(${taskTemplateItems.id})::int`,
    })
    .from(taskTemplates)
    .leftJoin(taskTemplateItems, eq(taskTemplateItems.templateId, taskTemplates.id))
    .where(
      and(eq(taskTemplates.organizationId, organizationId), eq(taskTemplates.isArchived, false)),
    )
    .groupBy(
      taskTemplates.id,
      taskTemplates.title,
      taskTemplates.description,
      taskTemplates.priority,
    )
    .orderBy(asc(taskTemplates.title));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority as TaskPriority,
    itemCount: row.itemCount ?? 0,
  }));
}

export async function listLabelIdsForTask(
  db: DbExecutor,
  taskId: string,
): Promise<string[]> {
  const rows = await db
    .select({ labelId: taskLabelAssignments.labelId })
    .from(taskLabelAssignments)
    .where(eq(taskLabelAssignments.taskId, taskId));
  return rows.map((row) => row.labelId);
}
