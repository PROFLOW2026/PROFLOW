import 'server-only';

import { and, eq } from 'drizzle-orm';
import { taskAssignees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import {
  employeeHasPermission,
  employeePermissionScope,
} from './load-employee-app-context';
import { resolveAccessibleProjectIdsForEmployeePermission } from './project-scope';

export interface EmployeeTaskRef {
  readonly taskId: string;
  readonly projectId: string | null;
}

/**
 * Mirrors app.uwm_employee_can_exercise_task_permission + app.uwm_employee_scope_allows_task.
 */
export async function employeeCanExerciseTaskPermission(
  context: OrgContext,
  permissionKey: PermissionKey,
  task: EmployeeTaskRef,
  employeeId: string,
): Promise<boolean> {
  const scope = resolveEffectiveTaskPermissionScope(context, permissionKey);
  if (!scope) return false;
  return scopeAllowsTask(context, scope, permissionKey, task, employeeId);
}

export function employeeHasTaskMutationGrant(
  context: OrgContext,
  permissionKey: PermissionKey,
): boolean {
  if (employeePermissionScope(context, permissionKey) !== null) return true;
  if (permissionKey === PERMISSIONS.TASKS_MANAGE_ALL) return false;
  return employeePermissionScope(context, PERMISSIONS.TASKS_MANAGE_ALL) !== null;
}

export function employeeCanUpdateTaskGrant(context: OrgContext): boolean {
  return (
    employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE) !== null ||
    employeePermissionScope(context, PERMISSIONS.TASKS_MANAGE_ALL) !== null
  );
}

function resolveEffectiveTaskPermissionScope(
  context: OrgContext,
  permissionKey: PermissionKey,
): PermissionScope | null {
  const direct = employeePermissionScope(context, permissionKey);
  if (direct) return direct;
  if (permissionKey === PERMISSIONS.TASKS_MANAGE_ALL) return null;
  return employeePermissionScope(context, PERMISSIONS.TASKS_MANAGE_ALL);
}

async function scopeAllowsTask(
  context: OrgContext,
  scope: PermissionScope,
  permissionKey: PermissionKey,
  task: EmployeeTaskRef,
  employeeId: string,
): Promise<boolean> {
  if (scope === 'all_organization') return true;

  if (scope === 'self_only') {
    const [assignee] = await context.db
      .select({ id: taskAssignees.id })
      .from(taskAssignees)
      .where(
        and(eq(taskAssignees.taskId, task.taskId), eq(taskAssignees.employeeId, employeeId)),
      );
    return Boolean(assignee);
  }

  if (!task.projectId) return false;

  const allowedProjects = await resolveAccessibleProjectIdsForEmployeePermission(
    context,
    permissionKey,
  );
  if (allowedProjects === null) return true;
  return allowedProjects.includes(task.projectId);
}

export async function assertEmployeeCanExerciseTaskPermission(
  context: OrgContext,
  permissionKey: PermissionKey,
  task: EmployeeTaskRef,
  employeeId: string,
): Promise<void> {
  const allowed = await employeeCanExerciseTaskPermission(
    context,
    permissionKey,
    task,
    employeeId,
  );
  if (!allowed) {
    const { NotFoundError } = await import('@/shared/errors');
    throw new NotFoundError('Task');
  }
}

export async function employeeCanCreateTaskInProject(
  context: OrgContext,
  projectId: string,
  _employeeId: string,
): Promise<boolean> {
  if (!employeeHasPermission(context, PERMISSIONS.TASKS_CREATE)) return false;
  const scope = employeePermissionScope(context, PERMISSIONS.TASKS_CREATE);
  if (!scope) return false;
  if (scope === 'all_organization') return true;
  const allowed = await resolveAccessibleProjectIdsForEmployeePermission(
    context,
    PERMISSIONS.TASKS_CREATE,
  );
  if (allowed === null) return true;
  return allowed.includes(projectId);
}
