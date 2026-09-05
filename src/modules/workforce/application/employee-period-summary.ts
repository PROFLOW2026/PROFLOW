/**
 * Employee Period Summary use-case (LAB-HIGH-001).
 *
 * Aggregates attendance days + time entries for an employee over a date range,
 * returning a structured breakdown by project and unallocated totals.
 *
 * Performance: two set-based queries (attendance + time entries) — no N+1 loops.
 */

import type { OrgContext } from '@/shared/auth/context';
import type { BusinessDate } from '@/shared/dates';
import { addDays } from '@/shared/dates';
import { assertAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  fromNumericString,
  addMoney,
  zeroMoney,
  roundMoney,
  type MoneyValue,
} from '@/shared/money';
import { listAttendanceDays } from '../data/attendance.repository';
import { listTimeEntries } from '../data/time-entries.repository';

export interface EmployeePeriodProjectRow {
  readonly projectId: string;
  readonly projectName: string;
  /** Distinct attendance days where a time entry references this project. */
  readonly days: number;
  readonly hours: number;
  /** Recognized labor cost for this project slice; null when cost not yet resolved. */
  readonly allocatedCost: MoneyValue | null;
}

export interface EmployeePeriodSummary {
  readonly employeeId: string;
  readonly fromDate: BusinessDate;
  readonly toDate: BusinessDate;
  /** Non-void attendance days in range. */
  readonly totalDays: number;
  /** Sum of approved hours from time entries in range. */
  readonly totalHours: number;
  /** Project-level breakdown (approved time entries). */
  readonly projectBreakdown: readonly EmployeePeriodProjectRow[];
  /** Days with attendance but no project time entry logged. */
  readonly unallocatedDays: number;
  /** Hours logged without a project (general/non_project time entries). */
  readonly unallocatedHours: number;
  /**
   * Approximate unallocated cost from non-project time entries.
   * Null when any cost is missing.
   */
  readonly unallocatedCost: MoneyValue | null;
  /**
   * Work-days in the range that have no attendance record at all.
   * Only populated when a standard work-week is provided.
   */
  readonly missingDays: string[];
  /** Time entries awaiting manager approval (submitted). */
  readonly pendingApprovalCount: number;
  /** Time entries already approved. */
  readonly approvedCount: number;
  /** Currency of cost figures. */
  readonly currency: string;
}

export interface EmployeePeriodSummaryInput {
  readonly employeeId: string;
  readonly fromDate: BusinessDate;
  readonly toDate: BusinessDate;
  /**
   * Days of week that count as work days (0 = Sunday … 6 = Saturday).
   * Used to compute missingDays. When omitted, missingDays is always [].
   */
  readonly workWeekdays?: readonly number[];
}

/**
 * Build the period summary for one employee over a date range.
 * Requires at least one of: attendance.read, attendance.manage, attendance.self.
 */
export async function getEmployeePeriodSummary(
  context: OrgContext,
  input: EmployeePeriodSummaryInput,
): Promise<EmployeePeriodSummary> {
  assertAnyPermission(context, [
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SELF,
  ]);

  const { employeeId, fromDate, toDate } = input;
  const currency = context.organization.baseCurrency.toUpperCase();

  // Run attendance + time queries in parallel (set-based, no N+1).
  const [attendanceDays, timeEntries] = await Promise.all([
    listAttendanceDays(context.db, context.organizationId, {
      employeeId,
      fromDate,
      toDate,
      // Include open and complete days; skip void.
    }),
    hasPermission(context, PERMISSIONS.TIME_MANAGE) ||
    hasPermission(context, PERMISSIONS.TIME_APPROVE) ||
    hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ)
      ? listTimeEntries(context.db, context.organizationId, {
          employeeId,
          fromDate,
          toDate,
          status: 'recorded',
          includeArchived: false,
        })
      : Promise.resolve([]),
  ]);

  // Non-void attendance days.
  const activeDays = attendanceDays.filter((d) => d.status !== 'void');
  const totalDays = activeDays.length;
  const attendedDates = new Set(activeDays.map((d) => d.workDate));

  // Build project-level aggregates from time entries.
  type ProjectAcc = {
    projectName: string;
    workDates: Set<string>;
    hours: number;
    cost: MoneyValue;
    missingCost: boolean;
  };

  const byProject = new Map<string, ProjectAcc>();
  let unallocatedHours = 0;
  let unallocatedCost = zeroMoney(currency);
  let unallocatedCostMissing = false;

  for (const entry of timeEntries) {
    const hours = Number(entry.hours) || 0;

    if (entry.kind === 'project' && entry.projectId) {
      const acc = byProject.get(entry.projectId);
      const costValue =
        entry.costAmount && entry.costCurrency
          ? (fromNumericString(entry.costAmount, entry.costCurrency) ?? null)
          : null;

      if (!acc) {
        byProject.set(entry.projectId, {
          projectName: entry.projectName ?? entry.projectId,
          workDates: new Set([entry.workDate]),
          hours,
          cost: costValue ?? zeroMoney(currency),
          missingCost: costValue === null,
        });
      } else {
        acc.workDates.add(entry.workDate);
        acc.hours += hours;
        if (costValue) acc.cost = addMoney(acc.cost, costValue);
        if (costValue === null) acc.missingCost = true;
      }
    } else {
      // Non-project or general time (overhead / vacation etc.)
      unallocatedHours += hours;
      const costValue =
        entry.costAmount && entry.costCurrency
          ? (fromNumericString(entry.costAmount, entry.costCurrency) ?? null)
          : null;
      if (costValue) {
        unallocatedCost = addMoney(unallocatedCost, costValue);
      } else {
        unallocatedCostMissing = true;
      }
    }
  }

  // Project breakdown as readonly array.
  const projectBreakdown: EmployeePeriodProjectRow[] = [];
  for (const [projectId, acc] of byProject) {
    projectBreakdown.push({
      projectId,
      projectName: acc.projectName,
      days: acc.workDates.size,
      hours: acc.hours,
      allocatedCost: acc.missingCost ? null : roundMoney(acc.cost),
    });
  }
  projectBreakdown.sort((a, b) => b.hours - a.hours);

  // Unallocated days = attendance days without any project time entry.
  const daysWithProjectTime = new Set(
    timeEntries
      .filter((e) => e.kind === 'project' && e.projectId)
      .map((e) => e.workDate),
  );
  const unallocatedDays = [...attendedDates].filter((d) => !daysWithProjectTime.has(d)).length;

  // Total hours across all entries.
  const totalHours = timeEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  // Missing days: work-days in range with no attendance record.
  const missingDays: string[] = [];
  if (input.workWeekdays && input.workWeekdays.length > 0) {
    const workWeekSet = new Set(input.workWeekdays);
    let cursor = fromDate;
    while (cursor <= toDate) {
      const dow = new Date(`${cursor}T12:00:00Z`).getUTCDay();
      if (workWeekSet.has(dow) && !attendedDates.has(cursor)) {
        missingDays.push(cursor);
      }
      cursor = addDays(cursor, 1);
    }
  }

  return {
    employeeId,
    fromDate,
    toDate,
    totalDays,
    totalHours,
    projectBreakdown,
    unallocatedDays,
    unallocatedHours,
    unallocatedCost: unallocatedCostMissing ? null : roundMoney(unallocatedCost),
    missingDays,
    pendingApprovalCount: timeEntries.filter((entry) => entry.approvalStatus === 'submitted').length,
    approvedCount: timeEntries.filter((entry) => entry.approvalStatus === 'approved').length,
    currency,
  };
}
