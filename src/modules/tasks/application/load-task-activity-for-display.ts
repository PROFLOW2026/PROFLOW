/**
 * Server-side data loader for task activity with actor name enrichment.
 * Separate from the lean listActivity() function so the UI can display names.
 */
import 'server-only';

import { asc, and, eq } from 'drizzle-orm';
import { taskActivity, organizationMemberships, profiles, employees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import { assertEmployeeCanExerciseTaskPermission } from '@/modules/employee-app/application/task-permission-scope';
import { assertCanAccessTask } from './assert-task-access';
import { findTaskById } from '../data/tasks.repository';

export interface TaskActivityDisplayRow {
  id: string;
  eventType: string;
  createdAt: Date;
  actorSystem: boolean;
  actorName: string | null;
  payload: Record<string, unknown> | null;
}

const PAGE_SIZE = 50;

async function assertCanReadTaskActivity(context: OrgContext, taskId: string): Promise<void> {
  if (isEmployeeAppUser(context)) {
    const employeeId = context.employeeApp?.employeeId;
    if (!employeeId || !hasPermission(context, PERMISSIONS.TASKS_READ)) {
      throw new NotFoundError('Task');
    }

    const task = await findTaskById(context.db, context.organizationId, taskId);
    if (!task) throw new NotFoundError('Task');

    await assertEmployeeCanExerciseTaskPermission(
      context,
      PERMISSIONS.TASKS_READ,
      { taskId, projectId: task.projectId },
      employeeId,
    );
    return;
  }

  await assertCanAccessTask(context, taskId);
}

export async function loadTaskActivityForDisplay(
  taskId: string,
): Promise<TaskActivityDisplayRow[]> {
  return withOrgContext(async (context) => {
    await assertCanReadTaskActivity(context, taskId);

    const rows = await context.db
      .select({
        id: taskActivity.id,
        eventType: taskActivity.eventType,
        createdAt: taskActivity.createdAt,
        actorSystem: taskActivity.actorSystem,
        payload: taskActivity.payload,
        actorOrgMemberId: taskActivity.actorOrgMemberId,
        actorEmployeeId: taskActivity.actorEmployeeId,
        memberDisplayName: profiles.displayName,
        employeeFullName: employees.name,
      })
      .from(taskActivity)
      .leftJoin(
        organizationMemberships,
        eq(taskActivity.actorOrgMemberId, organizationMemberships.id),
      )
      .leftJoin(profiles, eq(organizationMemberships.userId, profiles.id))
      .leftJoin(employees, eq(taskActivity.actorEmployeeId, employees.id))
      .where(
        and(
          eq(taskActivity.taskId, taskId),
          eq(taskActivity.organizationId, context.organizationId),
        ),
      )
      .orderBy(asc(taskActivity.createdAt))
      .limit(PAGE_SIZE);

    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      createdAt: row.createdAt,
      actorSystem: row.actorSystem ?? false,
      actorName: row.memberDisplayName ?? row.employeeFullName ?? null,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
    }));
  });
}
