import 'server-only';

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { employeeProjectAssignments, projects, punchListItems } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { resolveAccessibleProjectIdsForUser } from './project-scope';

export async function listEmployeeAssignedProjects(
  context: OrgContext,
): Promise<Array<{ id: string; name: string }>> {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) return [];
  const today = todayInTimeZone(context.organization.timezone);
  return context.db
    .select({ id: projects.id, name: projects.name })
    .from(employeeProjectAssignments)
    .innerJoin(projects, eq(projects.id, employeeProjectAssignments.projectId))
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
        isNull(projects.archivedAt),
      ),
    );
}

export async function listEmployeeAssignedTasks(
  context: OrgContext,
): Promise<Array<{ id: string; title: string; status: string; projectId: string | null }>> {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) return [];

  const allowedProjects = await resolveAccessibleProjectIdsForUser(context);
  const rows = await context.db
    .select({
      id: punchListItems.id,
      title: punchListItems.title,
      status: punchListItems.status,
      projectId: punchListItems.projectId,
    })
    .from(punchListItems)
    .where(
      and(
        eq(punchListItems.organizationId, context.organizationId),
        eq(punchListItems.assigneeEmployeeId, employeeId),
        isNull(punchListItems.archivedAt),
      ),
    )
    .limit(50);

  if (allowedProjects === null) return rows;
  return rows.filter((row) => !row.projectId || allowedProjects.includes(row.projectId));
}
