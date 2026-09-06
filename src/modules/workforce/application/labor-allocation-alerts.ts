/**
 * Whether monthly labor unallocated to projects is actionable for Command Center.
 * General/admin employees with no project linkage are legitimate overhead — not alerts.
 */

import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { employeeProjectAssignments } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { listTimeEntries } from '../data/time-entries.repository';
import { monthDateBounds } from '../domain/monthly-accrual';

export async function employeeExpectsProjectLaborAllocation(
  context: OrgContext,
  employeeId: string,
  yearMonth: string,
): Promise<boolean> {
  const { fromDate, toDate } = monthDateBounds(yearMonth);

  const [assignment] = await context.db
    .select({ id: employeeProjectAssignments.id })
    .from(employeeProjectAssignments)
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, context.organizationId),
        eq(employeeProjectAssignments.employeeId, employeeId),
        eq(employeeProjectAssignments.status, 'active'),
        lte(employeeProjectAssignments.startDate, toDate),
        or(
          isNull(employeeProjectAssignments.endDate),
          gte(employeeProjectAssignments.endDate, fromDate),
        ),
      ),
    )
    .limit(1);

  if (assignment) return true;

  const entries = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    fromDate,
    toDate,
    forCosting: true,
    limit: 500,
  });

  return entries.some((entry) => entry.kind === 'project' && entry.projectId != null);
}
