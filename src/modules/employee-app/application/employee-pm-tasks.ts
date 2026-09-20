import 'server-only';

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  tasks,
  taskAssignees,
  taskChecklistItems,
  taskComments,
  taskActivity,
  projects,
  approvalRequests,
  employees,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { employeePermissionScope } from './load-employee-app-context';
import { assertEmployeeProjectScope, resolveAccessibleProjectIdsForEmployeePermission } from './project-scope';
import {
  assertEmployeeCanExerciseTaskPermission,
  employeeCanCreateTaskInProject,
  employeeCanExerciseTaskPermission,
  employeeCanUpdateTaskGrant,
  employeeHasTaskMutationGrant,
} from './task-permission-scope';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';

export interface EmployeePmTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: string | null;
  readonly projectId: string | null;
}

export interface EmployeePmTaskComment {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly isEdited: boolean;
  readonly authorEmployeeId: string | null;
  readonly authorOrgMemberId: string | null;
}

export interface EmployeePmTaskChecklistItem {
  readonly id: string;
  readonly title: string;
  readonly isDone: boolean;
  readonly sortKey: string;
  readonly dueDate: string | null;
}

export interface EmployeePmTaskDetail extends EmployeePmTaskSummary {
  readonly checklistItems: readonly EmployeePmTaskChecklistItem[];
  readonly comments: readonly EmployeePmTaskComment[];
}

export interface EmployeePmTaskWorkSummary {
  readonly dueToday: number;
  readonly overdue: number;
}

export interface EmployeeProjectTaskOverview {
  readonly id: string;
  readonly name: string;
  readonly documentNumber: string | null;
  readonly displayName: string;
  readonly totalTasks: number;
  readonly openTasks: number;
  readonly dueToday: number;
  readonly overdue: number;
}

const CLOSED_STATUSES = ['done', 'cancelled'] as const;

// ─── Scope resolution ─────────────────────────────────────────────────────────

/**
 * Returns the employee ID for the current context.
 * Throws if the user is not an active Employee App user.
 */
function requireEmployeeId(context: OrgContext): string {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) throw new DomainRuleError('Not an employee app user', 'employeeApp.errors.notConfigured');
  return employeeId;
}

/**
 * Resolves task IDs accessible by this employee given their tasks.read scope.
 *
 * Scope mapping (from PermissionScope):
 *   self_only      → tasks where this employee is a direct assignee
 *   assigned_only  → tasks where tasks.project_id is in the employee's assigned projects
 *   all_organization → no additional filter
 *
 * Returns null when the scope allows all tasks (all_organization).
 */
async function resolveEmployeeTaskScope(
  context: OrgContext,
  _employeeId: string,
): Promise<{ mode: 'none' } | { mode: 'self' } | { mode: 'projects'; projectIds: string[] } | { mode: 'all' }> {
  const scope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
  if (!scope) return { mode: 'none' };

  if (scope === 'all_organization') return { mode: 'all' };

  if (scope === 'self_only') return { mode: 'self' };

  const projectIds = await resolveAccessibleProjectIdsForEmployeePermission(
    context,
    PERMISSIONS.TASKS_READ,
  );
  if (projectIds === null) return { mode: 'all' };
  return { mode: 'projects', projectIds };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

function summarizeOpenTasks(
  rows: ReadonlyArray<{ status: string; dueDate: string | null }>,
  today: string,
): EmployeePmTaskWorkSummary {
  let dueToday = 0;
  let overdue = 0;
  for (const row of rows) {
    if (CLOSED_STATUSES.includes(row.status as (typeof CLOSED_STATUSES)[number])) continue;
    if (!row.dueDate) continue;
    if (row.dueDate === today) dueToday += 1;
    else if (row.dueDate < today) overdue += 1;
  }
  return { dueToday, overdue };
}

async function queryEmployeePmTaskRows(
  context: OrgContext,
  employeeId: string,
  scopeResult: Awaited<ReturnType<typeof resolveEmployeeTaskScope>>,
  options?: { projectId?: string; limit?: number },
): Promise<
  Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    projectId: string | null;
  }>
> {
  const baseWhere = and(
    eq(tasks.organizationId, context.organizationId),
    isNull(tasks.archivedAt),
    ...(options?.projectId ? [eq(tasks.projectId, options.projectId)] : []),
  );
  const limit = options?.limit ?? 100;

  if (scopeResult.mode === 'self') {
    return context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        projectId: tasks.projectId,
      })
      .from(tasks)
      .innerJoin(
        taskAssignees,
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.employeeId, employeeId),
        ),
      )
      .where(baseWhere)
      .orderBy(asc(tasks.dueDate), asc(tasks.sortKey))
      .limit(limit);
  }

  if (scopeResult.mode === 'projects') {
    if (scopeResult.projectIds.length === 0) return [];
    if (options?.projectId && !scopeResult.projectIds.includes(options.projectId)) return [];
    return context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        projectId: tasks.projectId,
      })
      .from(tasks)
      .where(
        and(
          baseWhere,
          inArray(tasks.projectId, options?.projectId ? [options.projectId] : scopeResult.projectIds),
        ),
      )
      .orderBy(asc(tasks.dueDate), asc(tasks.sortKey))
      .limit(limit);
  }

  return context.db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(baseWhere)
    .orderBy(asc(tasks.dueDate), asc(tasks.sortKey))
    .limit(limit);
}

/**
 * Lists PM tasks visible to the current employee.
 * Returns [] if the employee has no tasks.read grant.
 */
export async function listEmployeePmTasks(
  context: OrgContext,
  options?: { projectId?: string; limit?: number },
): Promise<EmployeePmTaskSummary[]> {
  const employeeId = requireEmployeeId(context);
  const scopeResult = await resolveEmployeeTaskScope(context, employeeId);
  if (scopeResult.mode === 'none') return [];
  return queryEmployeePmTaskRows(context, employeeId, scopeResult, {
    ...options,
    limit: options?.limit ?? 500,
  });
}

/** Due-today and overdue counts for open PM tasks visible to the employee. */
export async function getEmployeePmTaskWorkSummary(
  context: OrgContext,
): Promise<EmployeePmTaskWorkSummary | null> {
  const employeeId = requireEmployeeId(context);
  const scopeResult = await resolveEmployeeTaskScope(context, employeeId);
  if (scopeResult.mode === 'none') return null;

  const today = todayInTimeZone(context.organization.timezone);
  const rows = await queryEmployeePmTaskRows(context, employeeId, scopeResult, { limit: 500 });
  return summarizeOpenTasks(rows, today);
}

/** Project overview with task counts — no financial fields. */
export async function getEmployeeProjectTaskOverview(
  context: OrgContext,
  projectId: string,
): Promise<EmployeeProjectTaskOverview | null> {
  const employeeId = requireEmployeeId(context);
  const scopeResult = await resolveEmployeeTaskScope(context, employeeId);

  await assertEmployeeProjectScope(context, PERMISSIONS.PROJECTS_READ, projectId);

  const [project] = await context.db
    .select({ id: projects.id, name: projects.name, documentNumber: projects.documentNumber })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, context.organizationId),
        isNull(projects.archivedAt),
      ),
    );
  if (!project) return null;

  const today = todayInTimeZone(context.organization.timezone);
  let taskRows: Array<{ status: string; dueDate: string | null }> = [];

  if (scopeResult.mode !== 'none') {
    const rows = await queryEmployeePmTaskRows(context, employeeId, scopeResult, {
      projectId,
      limit: 500,
    });
    taskRows = rows;
  }

  const openTasks = taskRows.filter(
    (row) => !CLOSED_STATUSES.includes(row.status as (typeof CLOSED_STATUSES)[number]),
  ).length;
  const { dueToday, overdue } = summarizeOpenTasks(taskRows, today);

  return {
    id: project.id,
    name: project.name,
    documentNumber: project.documentNumber,
    displayName: formatProjectDisplayName(project.name, project.documentNumber),
    totalTasks: taskRows.length,
    openTasks,
    dueToday,
    overdue,
  };
}

/**
 * Gets full task detail including checklist and comments.
 * Verifies the employee has access to this task via their scope.
 */
export async function getEmployeePmTaskDetail(
  context: OrgContext,
  taskId: string,
): Promise<EmployeePmTaskDetail> {
  const employeeId = requireEmployeeId(context);
  const scopeResult = await resolveEmployeeTaskScope(context, employeeId);
  if (scopeResult.mode === 'none') throw new NotFoundError('Task');

  // Load the task
  const [task] = await context.db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );

  if (!task) throw new NotFoundError('Task');

  // Verify scope access
  if (scopeResult.mode === 'self') {
    const [assignee] = await context.db
      .select({ id: taskAssignees.id })
      .from(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, taskId),
          eq(taskAssignees.employeeId, employeeId),
        ),
      );
    if (!assignee) throw new NotFoundError('Task');
  } else if (scopeResult.mode === 'projects') {
    if (!task.projectId || !scopeResult.projectIds.includes(task.projectId)) {
      throw new NotFoundError('Task');
    }
  }
  // mode === 'all' → no additional check

  // Load checklist items
  const checklistRows = await context.db
    .select({
      id: taskChecklistItems.id,
      title: taskChecklistItems.title,
      isDone: taskChecklistItems.isDone,
      sortKey: taskChecklistItems.sortKey,
      dueDate: taskChecklistItems.dueDate,
    })
    .from(taskChecklistItems)
    .where(
      and(
        eq(taskChecklistItems.taskId, taskId),
        eq(taskChecklistItems.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(taskChecklistItems.sortKey));

  // Load comments (non-deleted, most recent last)
  const commentRows = await context.db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      isEdited: taskComments.isEdited,
      authorEmployeeId: taskComments.authorEmployeeId,
      authorOrgMemberId: taskComments.authorOrgMemberId,
    })
    .from(taskComments)
    .where(
      and(
        eq(taskComments.taskId, taskId),
        eq(taskComments.organizationId, context.organizationId),
        eq(taskComments.isDeleted, false),
      ),
    )
    .orderBy(asc(taskComments.createdAt));

  return {
    ...task,
    checklistItems: checklistRows,
    comments: commentRows,
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Adds a comment to a PM task.
 * Author is set to the employee's employee_id — NEVER org_member_id.
 */
export async function addEmployeePmTaskComment(
  context: OrgContext,
  taskId: string,
  body: string,
): Promise<void> {
  const employeeId = requireEmployeeId(context);
  if (!employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_COMMENT)) {
    throw new DomainRuleError('No permission to comment on tasks', 'employeeApp.errors.notAuthorized');
  }

  const [task] = await context.db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );
  if (!task) throw new NotFoundError('Task');

  await assertEmployeeCanExerciseTaskPermission(
    context,
    PERMISSIONS.TASKS_COMMENT,
    { taskId, projectId: task.projectId },
    employeeId,
  );

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new DomainRuleError('Comment body cannot be empty', 'employeeApp.errors.commentEmpty');
  }

  await context.db.insert(taskComments).values({
    taskId,
    organizationId: context.organizationId,
    authorEmployeeId: employeeId,
    body: trimmedBody,
    isEdited: false,
    isDeleted: false,
  });

  await context.db.insert(taskActivity).values({
    taskId,
    organizationId: context.organizationId,
    actorEmployeeId: employeeId,
    actorSystem: false,
    eventType: 'comment_added',
  });
}

/**
 * Updates the status of a PM task.
 * Records task_activity with actor_employee_id — NEVER actor_org_member_id.
 */
export async function updateEmployeePmTaskStatus(
  context: OrgContext,
  taskId: string,
  newStatus: string,
): Promise<void> {
  const employeeId = requireEmployeeId(context);
  if (!employeeCanUpdateTaskGrant(context)) {
    throw new DomainRuleError('No permission to update tasks', 'employeeApp.errors.notAuthorized');
  }

  const [task] = await context.db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );
  if (!task) throw new NotFoundError('Task');

  const updateScope = employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE);
  const permissionKey = updateScope ? PERMISSIONS.TASKS_UPDATE : PERMISSIONS.TASKS_MANAGE_ALL;
  await assertEmployeeCanExerciseTaskPermission(
    context,
    permissionKey,
    { taskId, projectId: task.projectId },
    employeeId,
  );

  const previousStatus = task.status;
  if (previousStatus === newStatus) return;

  const isDone = newStatus === 'done';
  const updated = await context.db
    .update(tasks)
    .set({
      status: newStatus as typeof tasks.$inferSelect.status,
      updatedAt: new Date(),
      completionDate: isDone ? new Date().toISOString().split('T')[0] : undefined,
      completedByEmployeeId: isDone ? employeeId : undefined,
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
      ),
    )
    .returning({ id: tasks.id });

  if (updated.length === 0) {
    throw new DomainRuleError('Task update was not permitted', 'employeeApp.errors.notAuthorized');
  }

  await context.db.insert(taskActivity).values({
    taskId,
    organizationId: context.organizationId,
    actorEmployeeId: employeeId,
    actorSystem: false,
    eventType: 'status_changed',
  });
}

/**
 * Updates the due date of a PM task (postpone / reschedule).
 * Records task_activity with actor_employee_id — NEVER actor_org_member_id.
 */
export async function updateEmployeePmTaskDueDate(
  context: OrgContext,
  taskId: string,
  newDueDate: string | null,
): Promise<void> {
  const employeeId = requireEmployeeId(context);
  if (!employeeCanUpdateTaskGrant(context)) {
    throw new DomainRuleError('No permission to update tasks', 'employeeApp.errors.notAuthorized');
  }

  const [task] = await context.db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );
  if (!task) throw new NotFoundError('Task');

  const updateScope = employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE);
  const permissionKey = updateScope ? PERMISSIONS.TASKS_UPDATE : PERMISSIONS.TASKS_MANAGE_ALL;
  await assertEmployeeCanExerciseTaskPermission(
    context,
    permissionKey,
    { taskId, projectId: task.projectId },
    employeeId,
  );

  const previousDueDate = task.dueDate;
  if (previousDueDate === newDueDate) return;

  const updated = await context.db
    .update(tasks)
    .set({
      dueDate: newDueDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
      ),
    )
    .returning({ id: tasks.id });

  if (updated.length === 0) {
    throw new DomainRuleError('Task update was not permitted', 'employeeApp.errors.notAuthorized');
  }

  await context.db.insert(taskActivity).values({
    taskId,
    organizationId: context.organizationId,
    actorEmployeeId: employeeId,
    actorSystem: false,
    eventType: 'due_date_changed',
    payload: { from: previousDueDate, to: newDueDate },
  });
}

/**
 * Toggles a checklist item's done state.
 * Requires tasks.update permission.
 */
export async function toggleEmployeePmTaskChecklistItem(
  context: OrgContext,
  taskId: string,
  checklistItemId: string,
  isDone: boolean,
): Promise<void> {
  const employeeId = requireEmployeeId(context);
  if (!employeeCanUpdateTaskGrant(context)) {
    throw new DomainRuleError('No permission to update tasks', 'employeeApp.errors.notAuthorized');
  }

  const [task] = await context.db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );
  if (!task) throw new NotFoundError('Task');

  const updateScope = employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE);
  const permissionKey = updateScope ? PERMISSIONS.TASKS_UPDATE : PERMISSIONS.TASKS_MANAGE_ALL;
  await assertEmployeeCanExerciseTaskPermission(
    context,
    permissionKey,
    { taskId, projectId: task.projectId },
    employeeId,
  );

  await context.db
    .update(taskChecklistItems)
    .set({ isDone, updatedAt: new Date() })
    .where(
      and(
        eq(taskChecklistItems.id, checklistItemId),
        eq(taskChecklistItems.taskId, taskId),
        eq(taskChecklistItems.organizationId, context.organizationId),
      ),
    );

  if (isDone) {
    await context.db.insert(taskActivity).values({
      taskId,
      organizationId: context.organizationId,
      actorEmployeeId: employeeId,
      actorSystem: false,
      eventType: 'checklist_completed',
    });
  }
}

export interface EmployeePmTaskCapabilities {
  readonly canRead: boolean;
  readonly canUpdate: boolean;
  readonly canComment: boolean;
  readonly canAssign: boolean;
  readonly canApprove: boolean;
}

export async function getEmployeePmTaskCapabilities(
  context: OrgContext,
  task: { id: string; projectId: string | null },
): Promise<EmployeePmTaskCapabilities> {
  const employeeId = requireEmployeeId(context);
  const taskRef = { taskId: task.id, projectId: task.projectId };
  const [canUpdate, canComment, canAssign, canApprove] = await Promise.all([
    employeeCanExerciseTaskPermission(context, PERMISSIONS.TASKS_UPDATE, taskRef, employeeId).then(
      (direct) =>
        direct ||
        employeeCanExerciseTaskPermission(
          context,
          PERMISSIONS.TASKS_MANAGE_ALL,
          taskRef,
          employeeId,
        ),
    ),
    employeeCanExerciseTaskPermission(context, PERMISSIONS.TASKS_COMMENT, taskRef, employeeId),
    employeeCanExerciseTaskPermission(context, PERMISSIONS.TASKS_ASSIGN, taskRef, employeeId),
    employeeCanExerciseTaskPermission(context, PERMISSIONS.TASKS_APPROVE, taskRef, employeeId),
  ]);
  return {
    canRead: true,
    canUpdate,
    canComment,
    canAssign,
    canApprove,
  };
}

export interface CreateEmployeePmTaskInput {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: string;
  readonly dueDate?: string | null;
  readonly estimatedEffortMinutes?: number | null;
  readonly assigneeEmployeeId?: string | null;
}

export async function createEmployeePmTask(
  context: OrgContext,
  input: CreateEmployeePmTaskInput,
): Promise<{ id: string }> {
  const employeeId = requireEmployeeId(context);
  if (!employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_CREATE)) {
    throw new DomainRuleError('No permission to create tasks', 'employeeApp.errors.notAuthorized');
  }

  const allowed = await employeeCanCreateTaskInProject(context, input.projectId, employeeId);
  if (!allowed) throw new NotFoundError('Project');

  const title = input.title.trim();
  if (!title) {
    throw new ValidationError([{ path: 'title', message: 'Title is required' }]);
  }

  const { listProjectWorkspaceLinksByProject } = await import('@/modules/workspaces');
  const links = await listProjectWorkspaceLinksByProject(context.db, input.projectId);
  const workspaceId = links[0]?.workspaceId;
  if (!workspaceId) throw new DomainRuleError('Project has no workspace link', 'tasks.errors.noWorkspace');

  const { insertTask, insertTaskAssignee, insertTaskActivity } = await import(
    '@/modules/tasks/data/tasks.repository'
  );
  const { generateSortKey } = await import('@/modules/tasks/domain/lexorank');

  const task = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId,
    title,
    description: input.description ?? null,
    projectId: input.projectId,
    priority: (input.priority as 'none') ?? 'none',
    dueDate: input.dueDate ?? null,
    estimatedEffortMinutes: input.estimatedEffortMinutes ?? null,
    source: 'manual',
    sortKey: generateSortKey(),
    createdByOrgMemberId: null,
    createdByEmployeeId: employeeId,
    createdBySystem: false,
  });

  if (input.assigneeEmployeeId && employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_ASSIGN)) {
    await insertTaskAssignee(context.db, {
      taskId: task.id,
      organizationId: context.organizationId,
      employeeId: input.assigneeEmployeeId,
      orgMemberId: null,
      assignedByOrgMemberId: null,
    });
  }

  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    actorEmployeeId: employeeId,
    actorSystem: false,
    eventType: 'created',
    payload: { title: task.title },
  });

  return { id: task.id };
}

export async function assignEmployeePmTaskAssignee(
  context: OrgContext,
  taskId: string,
  assigneeEmployeeId: string,
): Promise<void> {
  const employeeId = requireEmployeeId(context);
  if (!employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_ASSIGN)) {
    throw new DomainRuleError('No permission to assign tasks', 'employeeApp.errors.notAuthorized');
  }

  const [task] = await context.db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );
  if (!task) throw new NotFoundError('Task');

  await assertEmployeeCanExerciseTaskPermission(
    context,
    PERMISSIONS.TASKS_ASSIGN,
    { taskId, projectId: task.projectId },
    employeeId,
  );

  const { insertTaskAssignee, insertTaskActivity } = await import('@/modules/tasks/data/tasks.repository');
  await insertTaskAssignee(context.db, {
    taskId,
    organizationId: context.organizationId,
    employeeId: assigneeEmployeeId,
    orgMemberId: null,
    assignedByOrgMemberId: null,
  });

  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    actorEmployeeId: employeeId,
    actorSystem: false,
    eventType: 'assigned',
    payload: { employeeId: assigneeEmployeeId },
  });
}

export async function decideEmployeePmTaskApproval(
  context: OrgContext,
  taskId: string,
  requestId: string,
  decision: 'approved' | 'rejected',
  decisionNote?: string | null,
): Promise<void> {
  const employeeId = requireEmployeeId(context);
  const [task] = await context.db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, context.organizationId),
        isNull(tasks.archivedAt),
      ),
    );
  if (!task) throw new NotFoundError('Task');

  await assertEmployeeCanExerciseTaskPermission(
    context,
    PERMISSIONS.TASKS_APPROVE,
    { taskId, projectId: task.projectId },
    employeeId,
  );

  const { decideApprovalRequest } = await import('@/modules/approvals');
  await decideApprovalRequest(context, {
    requestId,
    decision,
    decisionNote: decisionNote ?? null,
  });
}

export async function listEmployeePmCreatableProjects(
  context: OrgContext,
): Promise<Array<{ id: string; displayName: string }>> {
  const employeeId = requireEmployeeId(context);
  if (!employeeHasTaskMutationGrant(context, PERMISSIONS.TASKS_CREATE)) return [];

  const allowed = await resolveAccessibleProjectIdsForEmployeePermission(
    context,
    PERMISSIONS.TASKS_CREATE,
  );
  if (allowed !== null && allowed.length === 0) return [];

  const rows = await context.db
    .select({ id: projects.id, name: projects.name, documentNumber: projects.documentNumber })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, context.organizationId),
        isNull(projects.archivedAt),
        ...(allowed ? [inArray(projects.id, allowed)] : []),
      ),
    )
    .orderBy(asc(projects.documentNumber), asc(projects.name));

  const result: Array<{ id: string; displayName: string }> = [];
  for (const row of rows) {
    if (await employeeCanCreateTaskInProject(context, row.id, employeeId)) {
      result.push({
        id: row.id,
        displayName: formatProjectDisplayName(row.name, row.documentNumber),
      });
    }
  }
  return result;
}

export interface EmployeePmTaskAssigneeOption {
  readonly id: string;
  readonly name: string;
}

export async function listEmployeePmTaskAssigneeOptions(
  context: OrgContext,
  projectId: string | null,
): Promise<EmployeePmTaskAssigneeOption[]> {
  if (!projectId) return [];

  const { listActiveAssignedEmployeeIds } = await import(
    '@/modules/workforce/data/project-team.repository'
  );
  const employeeIds = await listActiveAssignedEmployeeIds(
    context.db,
    context.organizationId,
    projectId,
  );
  if (employeeIds.length === 0) return [];

  const rows = await context.db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, context.organizationId),
        inArray(employees.id, employeeIds),
        isNull(employees.archivedAt),
      ),
    )
    .orderBy(asc(employees.name));

  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export interface EmployeePmTaskPendingApproval {
  readonly id: string;
  readonly status: string;
  readonly createdAt: Date;
}

export async function listEmployeePmTaskPendingApprovals(
  context: OrgContext,
  taskId: string,
): Promise<EmployeePmTaskPendingApproval[]> {
  const rows = await context.db
    .select({
      id: approvalRequests.id,
      status: approvalRequests.status,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, context.organizationId),
        eq(approvalRequests.entityType, 'task'),
        eq(approvalRequests.entityId, taskId),
        eq(approvalRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt));

  return rows;
}
