/**
 * Labor allocation alert eligibility and stale derived-state reconciliation.
 *
 * Alerts fire only when source work/time records lack project attribution (Case B).
 * Monthly balance residuals and stale allocation runs are never Owner tasks.
 */

import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employeeProjectAssignments,
  employees,
  laborAllocationRuns,
  timeEntries,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { money, toDecimalValue } from '@/shared/money';
import { isMonthClosed } from '@/modules/month-close';
import { listTimeEntries } from '../data/time-entries.repository';
import { monthDateBounds } from '../domain/monthly-accrual';
import {
  computeMonthlyEmployeeLaborAllocationDraft,
  recomputeMonthlyEmployeeCostForOpenMonth,
} from './monthly-cost-recompute';

export type UnattributedProjectLaborSource = {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly workDate: string;
  readonly timeEntryId: string;
  readonly hours: string;
};

/** Whether a recorded time row still needs explicit project attribution. */
export function timeEntryRequiresProjectAttribution(input: {
  readonly kind: string;
  readonly projectId: string | null;
  readonly hours: string | number;
}): boolean {
  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0) return false;
  if (input.kind === 'project' && input.projectId) return false;
  return true;
}

export async function employeeExpectsProjectLaborAllocation(
  context: OrgContext,
  employeeId: string,
  yearMonth: string,
): Promise<boolean> {
  const [employee] = await context.db
    .select({
      compensationClass: employees.compensationClass,
      defaultLaborAllocationIntent: employees.defaultLaborAllocationIntent,
    })
    .from(employees)
    .where(
      and(eq(employees.organizationId, context.organizationId), eq(employees.id, employeeId)),
    )
    .limit(1);

  if (
    employee?.compensationClass === 'owner_manager' &&
    employee.defaultLaborAllocationIntent === 'company_only'
  ) {
    return false;
  }

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

function priorCalendarYearMonth(yearMonth: string): string {
  const [yearRaw, monthRaw] = yearMonth.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (month <= 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Source rows where project-attributable work exists but project_id is missing.
 * Does not alert on monthly allocation balance alone.
 */
export async function listUnattributedProjectLaborSources(
  context: OrgContext,
  options: { readonly limit?: number } = {},
): Promise<UnattributedProjectLaborSource[]> {
  const limit = options.limit ?? 15;
  const today = todayInTimeZone(context.organization.timezone);
  const currentYearMonth = today.slice(0, 7);
  const fromYearMonth = priorCalendarYearMonth(priorCalendarYearMonth(currentYearMonth));
  const fromDate = `${fromYearMonth}-01`;

  const rows = await context.db
    .select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      employeeName: employees.name,
      workDate: timeEntries.workDate,
      hours: timeEntries.hours,
      kind: timeEntries.kind,
      projectId: timeEntries.projectId,
    })
    .from(timeEntries)
    .innerJoin(
      employees,
      and(
        eq(employees.id, timeEntries.employeeId),
        eq(employees.organizationId, timeEntries.organizationId),
      ),
    )
    .where(
      and(
        eq(timeEntries.organizationId, context.organizationId),
        eq(timeEntries.status, 'recorded'),
        isNull(timeEntries.archivedAt),
        sql`(${timeEntries.hours})::numeric > 0`,
        sql`${timeEntries.workDate} >= ${fromDate}`,
        sql`${timeEntries.workDate} <= ${today}`,
        or(
          eq(timeEntries.kind, 'non_project'),
          and(eq(timeEntries.kind, 'project'), isNull(timeEntries.projectId)),
        ),
      ),
    )
    .orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt))
    .limit(Math.min(limit * 4, 60));

  const expectsCache = new Map<string, boolean>();
  const results: UnattributedProjectLaborSource[] = [];

  for (const row of rows) {
    if (results.length >= limit) break;
    if (!timeEntryRequiresProjectAttribution(row)) continue;

    const yearMonth = row.workDate.slice(0, 7);
    const cacheKey = `${row.employeeId}:${yearMonth}`;
    let expects = expectsCache.get(cacheKey);
    if (expects === undefined) {
      expects = await employeeExpectsProjectLaborAllocation(context, row.employeeId, yearMonth);
      expectsCache.set(cacheKey, expects);
    }
    if (!expects) continue;

    results.push({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      workDate: row.workDate,
      timeEntryId: row.id,
      hours: row.hours,
    });
  }

  return results;
}

async function listUnattributedSourcesForEmployeeMonth(
  context: OrgContext,
  employeeId: string,
  yearMonth: string,
): Promise<UnattributedProjectLaborSource[]> {
  const { fromDate, toDate } = monthDateBounds(yearMonth);
  const expects = await employeeExpectsProjectLaborAllocation(context, employeeId, yearMonth);
  if (!expects) return [];

  const rows = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    fromDate,
    toDate,
    status: 'recorded',
    limit: 500,
  });

  return rows
    .filter((row) => timeEntryRequiresProjectAttribution(row))
    .map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName ?? '',
      workDate: row.workDate,
      timeEntryId: row.id,
      hours: row.hours,
    }));
}

/**
 * When all eligible sources already carry project attribution but the applied run
 * still shows unallocated balance, recompute open months — never surface as Owner alert.
 */
export async function reconcileStaleLaborAllocations(
  context: OrgContext,
  options: { readonly maxRepairs?: number } = {},
): Promise<number> {
  const maxRepairs = options.maxRepairs ?? 8;
  const today = todayInTimeZone(context.organization.timezone);
  const currentYearMonth = today.slice(0, 7);

  const staleRuns = await context.db
    .select({
      runId: laborAllocationRuns.id,
      unallocatedAmount: laborAllocationRuns.unallocatedAmount,
      currency: laborAllocationRuns.currency,
      employeeId: employeeMonthCosts.employeeId,
      yearMonth: employeeMonthCosts.yearMonth,
      monthStatus: employeeMonthCosts.status,
    })
    .from(laborAllocationRuns)
    .innerJoin(
      employeeMonthCosts,
      and(
        eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        eq(laborAllocationRuns.organizationId, employeeMonthCosts.organizationId),
      ),
    )
    .where(
      and(
        eq(laborAllocationRuns.organizationId, context.organizationId),
        inArray(laborAllocationRuns.status, ['applied', 'draft']),
        sql`(${laborAllocationRuns.unallocatedAmount})::numeric > 0`,
        sql`${employeeMonthCosts.yearMonth} <= ${currentYearMonth}`,
        sql`${employeeMonthCosts.status} <> 'closed'`,
      ),
    )
    .orderBy(desc(employeeMonthCosts.yearMonth))
    .limit(maxRepairs * 2);

  let repaired = 0;

  for (const row of staleRuns) {
    if (repaired >= maxRepairs) break;
    if (await isMonthClosed(context, row.yearMonth)) continue;

    const unattributed = await listUnattributedSourcesForEmployeeMonth(
      context,
      row.employeeId,
      row.yearMonth,
    );
    if (unattributed.length > 0) continue;

    const draft = await computeMonthlyEmployeeLaborAllocationDraft(context, {
      employeeId: row.employeeId,
      yearMonth: row.yearMonth,
    });
    if (draft.skipped) continue;

    const storedUnallocated = toDecimalValue(money(row.unallocatedAmount, row.currency));
    const computedUnallocated = toDecimalValue(draft.allocation.nonProjectOrUnallocated);
    if (computedUnallocated.gte(storedUnallocated)) continue;

    await recomputeMonthlyEmployeeCostForOpenMonth(context, {
      employeeId: row.employeeId,
      yearMonth: row.yearMonth,
      payrollSync: 'updateExistingOnly',
    });
    repaired += 1;
  }

  return repaired;
}
