import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { taskAssignees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';
import {
  assigneeDisplaysForTask,
  loadTaskAssigneeDisplayMap,
} from '@/modules/tasks/application/enrich-task-assignees';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { employeeCanUpdateTaskGrant } from '@/modules/employee-app/application/task-permission-scope';
import { listEmployeePmTasks } from './employee-pm-tasks';
import type { EmployeeTaskListItem } from '../ui/employee-filter-logic';

export interface EmployeeTaskListPayload {
  readonly tasks: readonly EmployeeTaskListItem[];
  readonly today: string;
  readonly currentEmployeeId: string;
  readonly canFilterByAssignee: boolean;
  readonly assigneeOptions: ReadonlyArray<{ id: string; name: string }>;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
}

function requireEmployeeId(context: OrgContext): string {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) throw new Error('Not an employee app user');
  return employeeId;
}

async function loadAssigneeEmployeeIdsByTask(
  context: OrgContext,
  taskIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (taskIds.length === 0) return new Map();

  const rows = await context.db
    .select({
      taskId: taskAssignees.taskId,
      employeeId: taskAssignees.employeeId,
    })
    .from(taskAssignees)
    .where(
      and(
        eq(taskAssignees.organizationId, context.organizationId),
        inArray(taskAssignees.taskId, [...taskIds]),
      ),
    );

  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.employeeId) continue;
    const current = map.get(row.taskId) ?? [];
    current.push(row.employeeId);
    map.set(row.taskId, current);
  }
  return map;
}

export async function buildEmployeeTaskListPayload(context: OrgContext): Promise<EmployeeTaskListPayload | null> {
  const readScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
  if (!readScope) return null;

  const employeeId = requireEmployeeId(context);
  const today = todayInTimeZone(context.organization.timezone);
  const rows = await listEmployeePmTasks(context);
  const taskIds = rows.map((row) => row.id);
  const projectIds = rows.map((row) => row.projectId).filter(Boolean) as string[];

  const [projectLabels, assigneeMap, assigneeEmployeeIdsByTask] = await Promise.all([
    loadProjectDisplayNameMap(context.db, context.organizationId, projectIds),
    loadTaskAssigneeDisplayMap(context.db, context.organizationId, taskIds),
    loadAssigneeEmployeeIdsByTask(context, taskIds),
  ]);

  const updateScope =
    employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE) ??
    employeePermissionScope(context, PERMISSIONS.TASKS_MANAGE_ALL);
  const canUpdateGrant = employeeCanUpdateTaskGrant(context);

  const assigneeNameById = new Map<string, string>();
  const tasks: EmployeeTaskListItem[] = rows.map((row) => {
    const assigneeEmployeeIds = assigneeEmployeeIdsByTask.get(row.id) ?? [];
    const assigneeLabel = assigneeDisplaysForTask(row.id, assigneeMap)
      .map((assignee) => assignee.displayName)
      .filter(Boolean)
      .join(', ');

    for (const id of assigneeEmployeeIds) {
      const label = assigneeDisplaysForTask(row.id, assigneeMap).find((a) => a.id === id)?.displayName;
      if (label) assigneeNameById.set(id, label);
    }

    let canPostpone = false;
    if (canUpdateGrant) {
      if (updateScope === 'self_only') {
        canPostpone = assigneeEmployeeIds.includes(employeeId);
      } else {
        canPostpone = true;
      }
    }

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      projectId: row.projectId,
      projectDisplayName: row.projectId ? (projectLabels.get(row.projectId) ?? null) : null,
      assigneeLabel,
      assigneeEmployeeIds,
      canPostpone,
    };
  });

  const projectOptions = [...projectLabels.entries()]
    .map(([id, displayName]) => ({ id, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const assigneeOptions = [...assigneeNameById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    tasks,
    today,
    currentEmployeeId: employeeId,
    canFilterByAssignee: readScope !== 'self_only',
    assigneeOptions,
    projectOptions,
  };
}
