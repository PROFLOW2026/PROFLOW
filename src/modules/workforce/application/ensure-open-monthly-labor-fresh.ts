/**
 * Refresh open-month monthly labor Actual before project financial reads.
 * Bounded: project-touching monthly employees + company_only owners.
 * Does not touch closed org months / closed employee-month rows.
 *
 * Month-boundary: `rollForwardPastMonthEmployerAccrualsForOrg` promotes past
 * open-month accruals to full recognition (includes company_only owners).
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employees,
  laborAllocationRunLines,
  laborAllocationRuns,
  rateVersions,
  timeEntries,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';
import { recomputeMonthlyEmployeeCostForOpenMonth } from './monthly-cost-recompute';

const freshByTx = new WeakMap<object, Map<string, Promise<void>>>();

export function priorCalendarYearMonth(yearMonth: string): string {
  const [yearRaw, monthRaw] = yearMonth.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (month <= 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Ensure current + prior open calendar months for project-touching monthly
 * employees (and company_only owners) are recomputed so Project Actual is not
 * stale after the accrual fix.
 *
 * Historical employee-months are not recomputed on every Financials read.
 * One in-flight promise per transaction + project.
 */
export async function ensureOpenMonthlyLaborFreshForProject(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  if (!areEmployeeMonthCostsAvailable()) return;

  const txKey = context.db as object;
  let byProject = freshByTx.get(txKey);
  if (!byProject) {
    byProject = new Map();
    freshByTx.set(txKey, byProject);
  }
  const hit = byProject.get(projectId);
  if (hit) return hit;
  const pending = ensureOpenMonthlyLaborFreshForProjectUncached(context, projectId);
  byProject.set(projectId, pending);
  return pending;
}

async function listCompanyOnlyMonthlyOwnerIds(context: OrgContext): Promise<readonly string[]> {
  const rows = await context.db
    .selectDistinct({ employeeId: employees.id })
    .from(employees)
    .innerJoin(
      rateVersions,
      and(
        eq(rateVersions.employeeId, employees.id),
        eq(rateVersions.organizationId, employees.organizationId),
        eq(rateVersions.rateUnit, 'monthly'),
      ),
    )
    .where(
      and(
        eq(employees.organizationId, context.organizationId),
        eq(employees.compensationClass, 'owner_manager'),
        eq(employees.defaultLaborAllocationIntent, 'company_only'),
        isNull(employees.archivedAt),
      ),
    );
  return rows.map((row) => row.employeeId);
}

async function ensureOpenMonthlyLaborFreshForProjectUncached(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  const today = todayInTimeZone(context.organization.timezone);
  const currentYearMonth = today.slice(0, 7);
  const minYearMonth = priorCalendarYearMonth(currentYearMonth);

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
        sql`${employeeMonthCosts.yearMonth} >= ${minYearMonth}`,
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
        sql`to_char(${timeEntries.workDate}::date, 'YYYY-MM') >= ${minYearMonth}`,
        sql`to_char(${timeEntries.workDate}::date, 'YYYY-MM') <= ${currentYearMonth}`,
      ),
    );

  const keys = new Map<string, { employeeId: string; yearMonth: string }>();
  for (const row of [...fromAlloc, ...fromTime]) {
    if (row.yearMonth < minYearMonth) continue;
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

  // company_only owners never appear on project lines — still refresh current + prior.
  for (const employeeId of await listCompanyOnlyMonthlyOwnerIds(context)) {
    keys.set(`${employeeId}:${currentYearMonth}`, { employeeId, yearMonth: currentYearMonth });
    keys.set(`${employeeId}:${minYearMonth}`, { employeeId, yearMonth: minYearMonth });
  }

  const items = [...keys.values()]
    .filter((item) => item.yearMonth >= minYearMonth)
    .sort((a, b) =>
      a.yearMonth === b.yearMonth
        ? a.employeeId.localeCompare(b.employeeId)
        : a.yearMonth.localeCompare(b.yearMonth),
    );

  const t0 = performance.now();
  for (const item of items) {
    try {
      await recomputeMonthlyEmployeeCostForOpenMonth(context, item);
    } catch {
      // One bad employee-month must not crash Project Financials; others still refresh.
    }
  }
  if (process.env.PF_TAB_PROFILE === '1') {
    console.error(
      `[labor-fresh] project=${projectId} employeeMonths=${items.length} ms=${Math.round(performance.now() - t0)}`,
    );
  }
}

export interface PastMonthAccrualRollForwardResult {
  readonly yearMonth: string;
  readonly scanned: number;
  readonly recomputed: number;
  readonly skipped: number;
  readonly failed: number;
}

/**
 * Month-boundary roll-forward: recompute the prior calendar month for every
 * monthly-rate employee, including company_only owners with no project touch.
 * Preserves known_quality=actual via shouldPreserveRecordedActualEmployerCost.
 */
export async function rollForwardPastMonthEmployerAccrualsForOrg(
  context: OrgContext,
): Promise<PastMonthAccrualRollForwardResult> {
  if (!areEmployeeMonthCostsAvailable()) {
    return { yearMonth: '', scanned: 0, recomputed: 0, skipped: 0, failed: 0 };
  }

  const today = todayInTimeZone(context.organization.timezone);
  const currentYearMonth = today.slice(0, 7);
  const yearMonth = priorCalendarYearMonth(currentYearMonth);

  const monthlyIds = await context.db
    .selectDistinct({ employeeId: rateVersions.employeeId })
    .from(rateVersions)
    .innerJoin(
      employees,
      and(
        eq(employees.id, rateVersions.employeeId),
        eq(employees.organizationId, rateVersions.organizationId),
      ),
    )
    .where(
      and(
        eq(rateVersions.organizationId, context.organizationId),
        eq(rateVersions.rateUnit, 'monthly'),
        isNull(employees.archivedAt),
      ),
    );

  let recomputed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of monthlyIds) {
    try {
      const result = await recomputeMonthlyEmployeeCostForOpenMonth(context, {
        employeeId: row.employeeId,
        yearMonth,
      });
      if (result.skipped) skipped += 1;
      else recomputed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    yearMonth,
    scanned: monthlyIds.length,
    recomputed,
    skipped,
    failed,
  };
}
