import 'server-only';

import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  tasks,
  taskAssignees,
  taskChecklistItems,
  taskComments,
  taskActivity,
  employeeProjectAssignments,
  projects,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { employeePermissionScope } from './load-employee-app-context';
import { assertEmployeeProjectScope } from './project-scope';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Returns the project IDs the employee is currently assigned to (active, date-bounded). */
async function getAssignedProjectIds(
  context: OrgContext,
  employeeId: string,
): Promise<string[]> {
  const today = todayInTimeZone(context.organization.timezone);
  const rows = await context.db
    .select({ projectId: employeeProjectAssignments.projectId })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, context.organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.status, 'active'),
        lte(employeeProjectAssignments.startDate, today),
        or(
          isNull(employeeProjectAssignments.endDate),
          sql`${employeeProjectAssignments.endDate} >= ${today}`,
        ),
      ),
    );
  return [...new Set(rows.map((r) => r.projectId))];
}

// ─── Public types ─────────────────────────────────────────────────────────────

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
  employeeId: string,
): Promise<{ mode: 'none' } | { mode: 'self' } | { mode: 'projects'; projectIds: string[] } | { mode: 'all' }> {
  const scope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
  if (!scope) return { mode: 'none' };

  if (scope === 'all_organization') return { mode: 'all' };

  if (scope === 'self_only') return { mode: 'self' };

  // assigned_only or granted_projects → filter by assigned project IDs
  const projectIds = await getAssignedProjectIds(context, employeeId);
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
  options?: { projectId?: string },
): Promise<EmployeePmTaskSummary[]> {
  const employeeId = requireEmployeeId(context);
  const scopeResult = await resolveEmployeeTaskScope(context, employeeId);
  if (scopeResult.mode === 'none') return [];
  return queryEmployeePmTaskRows(context, employeeId, scopeResult, options);
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
    .select({ id: projects.id, name: projects.name })
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
  const scope = employeePermissionScope(context, PERMISSIONS.TASKS_COMMENT);
  if (!scope) {
    throw new DomainRuleError('No permission to comment on tasks', 'employeeApp.errors.notAuthorized');
  }

  // Verify task access via tasks.read (comment implies read access)
  await getEmployeePmTaskDetail(context, taskId);

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new DomainRuleError('Comment body cannot be empty', 'employeeApp.errors.commentEmpty');
  }

  await context.db.insert(taskComments).values({
    taskId,
    organizationId: context.organizationId,
    // CRITICAL: Employee App always uses authorEmployeeId, never authorOrgMemberId
    authorEmployeeId: employeeId,
    body: trimmedBody,
    isEdited: false,
    isDeleted: false,
  });

  // Record activity — actor is the employee
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
  const scope = employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE);
  if (!scope) {
    throw new DomainRuleError('No permission to update tasks', 'employeeApp.errors.notAuthorized');
  }

  // Fetch current task (also verifies access)
  const detail = await getEmployeePmTaskDetail(context, taskId);
  const previousStatus = detail.status;

  if (previousStatus === newStatus) return; // no-op

  const isDone = newStatus === 'done';

  // Apply the status update — CRITICAL: completedByEmployeeId only, never completedByOrgMemberId
  await context.db
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
    );

  // Record activity — CRITICAL: actor_employee_id only, never actor_org_member_id
  await context.db.insert(taskActivity).values({
    taskId,
    organizationId: context.organizationId,
    actorEmployeeId: employeeId,
    actorSystem: false,
    eventType: 'status_changed',
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
  const scope = employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE);
  if (!scope) {
    throw new DomainRuleError('No permission to update tasks', 'employeeApp.errors.notAuthorized');
  }

  // Verify task access
  await getEmployeePmTaskDetail(context, taskId);

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

  // Record activity only when marking as done (checklist_completed is the canonical event)
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
