/**
 * Refresh open-month monthly labor Actual before project financial reads.
 * Bounded: only monthly employees that already touch this project (allocation or time).
 * Does not touch closed org months / closed employee-month rows.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  laborAllocationRunLines,
  laborAllocationRuns,
  rateVersions,
  timeEntries,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';
import { recomputeMonthlyEmployeeCostForOpenMonth } from './monthly-cost-recompute';

/**
 * Ensure current + prior open calendar months for project-touching monthly
 * employees are recomputed so Project Actual is not stale after the accrual fix.
 */
export async function ensureOpenMonthlyLaborFreshForProject(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  if (!areEmployeeMonthCostsAvailable()) return;

  const today = todayInTimeZone(context.organization.timezone);
  const currentYearMonth = today.slice(0, 7);

  const fromAlloc = await context.db
    .selectDistinct({ employeeId: employeeMonthCosts.employeeId, yearMonth: employeeMonthCosts.yearMonth })
    .from(laborAllocationRunLines)
    .innerJoin(
      laborAllocationRuns,
      and(
        eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        eq(laborAllocationRunLines.organizationId, laborAllocationRuns.organizationId),
      ),
    )
    .innerJoin(
      employeeMonthCosts,
      and(
        eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        eq(laborAllocationRuns.organizationId, employeeMonthCosts.organizationId),
      ),
    )
    .where(
      and(
        eq(laborAllocationRunLines.organizationId, context.organizationId),
        eq(laborAllocationRunLines.projectId, projectId),
        inArray(laborAllocationRuns.status, ['applied', 'draft']),
        inArray(employeeMonthCosts.status, ['draft', 'applied']),
        sql`${employeeMonthCosts.yearMonth} <= ${currentYearMonth}`,
      ),
    );

  const fromTime = await context.db
    .selectDistinct({
      employeeId: timeEntries.employeeId,
      yearMonth: sql<string>`to_char(${timeEntries.workDate}::date, 'YYYY-MM')`,
    })
    .from(timeEntries)
    .innerJoin(
      rateVersions,
      and(
        eq(rateVersions.employeeId, timeEntries.employeeId),
        eq(rateVersions.organizationId, timeEntries.organizationId),
        eq(rateVersions.rateUnit, 'monthly'),
      ),
    )
    .where(
      and(
        eq(timeEntries.organizationId, context.organizationId),
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.kind, 'project'),
        eq(timeEntries.status, 'recorded'),
        eq(timeEntries.approvalStatus, 'approved'),
        isNull(timeEntries.archivedAt),
        sql`to_char(${timeEntries.workDate}::date, 'YYYY-MM') <= ${currentYearMonth}`,
      ),
    );

  const keys = new Map<string, { employeeId: string; yearMonth: string }>();
  for (const row of [...fromAlloc, ...fromTime]) {
    keys.set(`${row.employeeId}:${row.yearMonth}`, {
      employeeId: row.employeeId,
      yearMonth: row.yearMonth,
    });
  }

  // Always include current month for monthly employees already allocated to this project.
  for (const row of fromAlloc) {
    keys.set(`${row.employeeId}:${currentYearMonth}`, {
      employeeId: row.employeeId,
      yearMonth: currentYearMonth,
    });
  }

  for (const item of [...keys.values()].sort((a, b) =>
    a.yearMonth === b.yearMonth
      ? a.employeeId.localeCompare(b.employeeId)
      : a.yearMonth.localeCompare(b.yearMonth),
  )) {
    try {
      await recomputeMonthlyEmployeeCostForOpenMonth(context, item);
    } catch {
      // One bad employee-month must not crash Project Financials; others still refresh.
    }
  }
}
