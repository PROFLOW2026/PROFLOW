import Decimal from 'decimal.js';
import type { OrgContext } from '@/shared/auth/context';
import { findEmployeeById } from '../data/employees.repository';
import { sumRecordedDailyHoursForPairs } from '../data/time-entries.repository';
import { dailySummaryKey } from '../domain/time-entry-list-grouping';
import { resolveDailyFrameworkHours } from '../domain/work-calendar';
import type { TimeEntryListItem } from '../domain/types';
import { loadOrgExplicitWorkCalendar } from './work-calendar-context';

export interface TimeEntryDailySummary {
  /** Total recorded hours for the employee on this date (all projects). */
  readonly reportedTotal: string;
  /** Configured daily framework when explicit org/employee setting exists. */
  readonly frameworkHours: string | null;
  /** reportedTotal − framework when framework configured and exceeded. */
  readonly excessHours: string | null;
  readonly hasPendingExcess: boolean;
}

export async function buildTimeEntryDailySummaries(
  context: OrgContext,
  entries: readonly TimeEntryListItem[],
): Promise<Map<string, TimeEntryDailySummary>> {
  if (entries.length === 0) return new Map();

  const pairs = uniqueEmployeeDates(entries);
  const [totals, org] = await Promise.all([
    sumRecordedDailyHoursForPairs(context.db, context.organizationId, pairs),
    loadOrgExplicitWorkCalendar(context.db, context.organizationId),
  ]);

  const frameworkByEmployee = new Map<string, ReturnType<typeof resolveDailyFrameworkHours>>();
  const summaries = new Map<string, TimeEntryDailySummary>();

  for (const pair of pairs) {
    const key = dailySummaryKey(pair.employeeId, pair.workDate);
    if (summaries.has(key)) continue;

    let framework = frameworkByEmployee.get(pair.employeeId);
    if (!framework) {
      const employee = await findEmployeeById(context.db, context.organizationId, pair.employeeId);
      framework = resolveDailyFrameworkHours({
        employeeStandardHoursPerDay: employee?.standardHoursPerDay ?? null,
        orgStandardHoursPerDay: org.standardHoursPerDay,
      });
      frameworkByEmployee.set(pair.employeeId, framework);
    }

    const reportedTotal = totals.get(key) ?? '0';
    const frameworkHours = framework.configured ? framework.standardHoursPerDay : null;
    let excessHours: string | null = null;
    if (frameworkHours) {
      const excess = new Decimal(reportedTotal).minus(frameworkHours);
      if (excess.gt(0)) excessHours = excess.toString();
    }

    const dayEntries = entries.filter(
      (entry) => entry.employeeId === pair.employeeId && entry.workDate === pair.workDate,
    );
    const hasPendingExcess = dayEntries.some(
      (entry) =>
        entry.excessHours != null &&
        Number(entry.excessHours) > 0 &&
        entry.excessApprovalStatus === 'pending',
    );

    summaries.set(key, {
      reportedTotal,
      frameworkHours,
      excessHours,
      hasPendingExcess,
    });
  }

  return summaries;
}

function uniqueEmployeeDates(
  entries: readonly TimeEntryListItem[],
): { employeeId: string; workDate: string }[] {
  const seen = new Set<string>();
  const pairs: { employeeId: string; workDate: string }[] = [];
  for (const entry of entries) {
    const key = dailySummaryKey(entry.employeeId, entry.workDate);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ employeeId: entry.employeeId, workDate: entry.workDate });
  }
  return pairs;
}

/** Test seam — build summaries without DB when totals/framework are precomputed. */
export function buildTimeEntryDailySummaryFromTotals(input: {
  readonly reportedTotal: string;
  readonly frameworkHours: string | null;
  readonly hasPendingExcess?: boolean;
}): TimeEntryDailySummary {
  let excessHours: string | null = null;
  if (input.frameworkHours) {
    const excess = new Decimal(input.reportedTotal).minus(input.frameworkHours);
    if (excess.gt(0)) excessHours = excess.toString();
  }
  return {
    reportedTotal: input.reportedTotal,
    frameworkHours: input.frameworkHours,
    excessHours,
    hasPendingExcess: input.hasPendingExcess ?? false,
  };
}
