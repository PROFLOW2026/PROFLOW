import 'server-only';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { projects, taskAssignees, tasks } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission, employeePermissionScope } from './load-employee-app-context';
import {
  resolveAccessibleProjectIdsForEmployeePermission,
  resolveAccessibleProjectIdsForUser,
} from './project-scope';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';
import { todayInTimeZone } from '@/shared/dates';
import { listEmployeesForOrg, listAttendanceDays, listTimeEntries } from '@/modules/workforce';
import { listFormTemplatesForOrg } from '@/modules/forms/application/manage-templates';
import { listExpensesForOrg } from '@/modules/expenses/application/queries';

export interface EmployeeTeamMemberRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly status: string;
  readonly openTaskCount: number;
  readonly projectNames: readonly string[];
}

export async function listEmployeeTeamRoster(context: OrgContext): Promise<EmployeeTeamMemberRow[]> {
  if (!employeeHasPermission(context, PERMISSIONS.WORKFORCE_READ)) return [];

  const scope = employeePermissionScope(context, PERMISSIONS.WORKFORCE_READ) ?? 'assigned_only';
  const projectIds =
    scope === 'all_organization'
      ? null
      : await resolveAccessibleProjectIdsForEmployeePermission(context, PERMISSIONS.WORKFORCE_READ);

  const allEmployees = await listEmployeesForOrg(context, { status: 'active' });
  let roster = allEmployees;

  if (projectIds !== null) {
    const { listActiveAssignedEmployeeIds } = await import(
      '@/modules/workforce/data/project-team.repository'
    );
    const allowedEmployeeIds = new Set<string>();
    for (const projectId of projectIds) {
      const ids = await listActiveAssignedEmployeeIds(
        context.db,
        context.organizationId,
        projectId,
      );
      for (const id of ids) allowedEmployeeIds.add(id);
    }
    roster = allEmployees.filter((employee) => allowedEmployeeIds.has(employee.id));
  }

  const projectNameById = new Map<string, string>();
  if (projectIds && projectIds.length > 0) {
    const projectRows = await context.db
      .select({ id: projects.id, name: projects.name, documentNumber: projects.documentNumber })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const row of projectRows) {
      projectNameById.set(row.id, formatProjectDisplayName(row.name, row.documentNumber));
    }
  }

  const openTaskCounts = new Map<string, number>();
  if (roster.length > 0) {
    const taskRows = await context.db
      .select({ employeeId: taskAssignees.employeeId, status: tasks.status })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .where(
        and(
          eq(tasks.organizationId, context.organizationId),
          isNull(tasks.archivedAt),
          inArray(taskAssignees.employeeId, roster.map((employee) => employee.id)),
        ),
      );
    for (const row of taskRows) {
      if (!row.employeeId || row.status === 'done' || row.status === 'cancelled') continue;
      openTaskCounts.set(row.employeeId, (openTaskCounts.get(row.employeeId) ?? 0) + 1);
    }
  }

  return roster.map((employee) => ({
    id: employee.id,
    name: employee.name,
    title: employee.jobTitle ?? null,
    status: employee.status,
    openTaskCount: openTaskCounts.get(employee.id) ?? 0,
    projectNames: projectIds
      ? projectIds.map((id) => projectNameById.get(id)).filter(Boolean) as string[]
      : [],
  }));
}

export interface EmployeeTeamAttendanceRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly workDate: string;
  readonly status: string;
  readonly clockInAt: string | null;
  readonly clockOutAt: string | null;
}

export async function listEmployeeTeamAttendanceToday(
  context: OrgContext,
): Promise<EmployeeTeamAttendanceRow[]> {
  if (!employeeHasPermission(context, PERMISSIONS.ATTENDANCE_READ)) return [];

  const today = todayInTimeZone(context.organization.timezone);
  const roster = await listEmployeeTeamRoster(context);
  const employeeIds = roster.map((member) => member.id);
  if (employeeIds.length === 0) return [];

  const rows = (
    await Promise.all(
      employeeIds.map((employeeId) =>
        listAttendanceDays(context.db, context.organizationId, {
          employeeId,
          fromDate: today,
          toDate: today,
        }),
      ),
    )
  ).flat();

  const nameById = new Map(roster.map((member) => [member.id, member.name]));
  return rows
    .filter((row) => employeeIds.includes(row.employeeId))
    .map((row) => ({
      employeeId: row.employeeId,
      employeeName: nameById.get(row.employeeId) ?? row.employeeId,
      workDate: row.workDate,
      status: row.status,
      clockInAt: row.clockInAt?.toISOString() ?? null,
      clockOutAt: row.clockOutAt?.toISOString() ?? null,
    }));
}

export interface EmployeePendingTimeRow {
  readonly id: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly workDate: string;
  readonly hours: string;
  readonly approvalStatus: string;
}

export async function listEmployeePendingTimeApprovals(
  context: OrgContext,
): Promise<EmployeePendingTimeRow[]> {
  if (!employeeHasPermission(context, PERMISSIONS.TIME_APPROVE)) return [];

  const roster = await listEmployeeTeamRoster(context);
  const employeeIds = new Set(roster.map((member) => member.id));
  const nameById = new Map(roster.map((member) => [member.id, member.name]));

  const entries = await listTimeEntries(context.db, context.organizationId, {
    approvalStatus: 'submitted',
  });

  return entries
    .filter((entry) => employeeIds.has(entry.employeeId))
    .slice(0, 100)
    .map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      employeeName: nameById.get(entry.employeeId) ?? entry.employeeName ?? entry.employeeId,
      workDate: entry.workDate,
      hours: entry.hours,
      approvalStatus: entry.approvalStatus,
    }));
}

export async function listEmployeeAccessibleForms(context: OrgContext) {
  if (!employeeHasPermission(context, PERMISSIONS.FORMS_READ)) return [];
  return listFormTemplatesForOrg(context, { enabledOnly: true });
}

export async function listEmployeeAccessibleExpenses(context: OrgContext) {
  if (!employeeHasPermission(context, PERMISSIONS.EXPENSES_READ)) return [];

  const scope = employeePermissionScope(context, PERMISSIONS.EXPENSES_READ) ?? 'assigned_only';
  const { items } = await listExpensesForOrg(context, { limit: 50 });

  if (scope === 'all_organization') return items;

  const allowedProjects = await resolveAccessibleProjectIdsForUser(context);
  if (allowedProjects === null) return items;
  return items.filter(
    (item) => !item.projectId || allowedProjects.includes(item.projectId),
  );
}

export async function resolveEmployeeOwnTimeEntries(context: OrgContext) {
  const linkedEmployeeId = context.employeeApp?.employeeId;
  if (!linkedEmployeeId) return [];

  return listTimeEntries(context.db, context.organizationId, { employeeId: linkedEmployeeId });
}

export async function listEmployeeCreatableExpenseProjects(
  context: OrgContext,
): Promise<Array<{ id: string; displayName: string }>> {
  if (!employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE)) return [];

  const scope = employeePermissionScope(context, PERMISSIONS.EXPENSES_CREATE) ?? 'assigned_only';
  if (scope === 'all_organization') {
    const rows = await context.db
      .select({ id: projects.id, name: projects.name, documentNumber: projects.documentNumber })
      .from(projects)
      .where(and(eq(projects.organizationId, context.organizationId), isNull(projects.archivedAt)))
      .orderBy(asc(projects.documentNumber), asc(projects.name));
    return rows.map((row) => ({
      id: row.id,
      displayName: formatProjectDisplayName(row.name, row.documentNumber),
    }));
  }

  const allowed = await resolveAccessibleProjectIdsForEmployeePermission(
    context,
    PERMISSIONS.EXPENSES_CREATE,
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

  return rows.map((row) => ({
    id: row.id,
    displayName: formatProjectDisplayName(row.name, row.documentNumber),
  }));
}

export async function createEmployeeOperationalExpense(
  context: OrgContext,
  input: {
    amount: string;
    description: string;
    expenseDate: string;
    projectId?: string | null;
    supplierName?: string | null;
  },
) {
  if (!employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE)) {
    throw new DomainRuleError('No permission to create expenses', 'employeeApp.errors.notAuthorized');
  }

  const projectId = input.projectId?.trim() || null;

  if (projectId) {
    const allowed = await resolveAccessibleProjectIdsForEmployeePermission(
      context,
      PERMISSIONS.EXPENSES_CREATE,
    );
    if (allowed !== null && !allowed.includes(projectId)) {
      throw new DomainRuleError('Project not in scope', 'employeeApp.errors.notAuthorized');
    }
  }

  const { createExpense } = await import('@/modules/expenses');
  return createExpense(context, {
    amount: input.amount.trim(),
    currency: context.organization.baseCurrency ?? 'ILS',
    description: input.description.trim() || null,
    expenseDate: input.expenseDate,
    supplierName: input.supplierName?.trim() || null,
    projectId,
  });
}
