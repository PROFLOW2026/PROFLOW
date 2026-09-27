/**
 * Owner attendance surfaces: today's roster and monthly employee×day grid.
 * Presence stays on attendance days; project / hours / approval come from time entries.
 */

import type { OrgContext } from '@/shared/auth/context';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { getLaborCostDefaultsForApply, resolveOrgWorkWeekdays } from '@/modules/tenancy';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listAttendanceOutcomesInRange } from './attendance-outcomes';
import { listAttendanceDays } from '../data/attendance.repository';
import { listEmployees } from '../data/employees.repository';
import { listTimeEntries } from '../data/time-entries.repository';
import { employeeRequiresAttendanceReporting } from '../domain/attendance-requirement';
import { isConfiguredOrgWorkday } from '../domain/attendance-workday';
import {
  employmentOverlapsDateRange,
  isWithinEmploymentRange,
} from '../domain/employment-active-range';
import type { TimeApprovalStatus, TimeEntryListItem, AttendanceDayListItem } from '../domain/types';

export type TodayApprovalStatus = TimeApprovalStatus | 'awaiting' | 'missing';

export interface TodayAttendanceRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly reported: boolean;
  readonly projectNames: readonly string[];
  readonly hours: number | null;
  readonly startTime: Date | null;
  readonly attendanceStatus: 'open' | 'complete' | 'void' | null;
  readonly approvalStatus: TodayApprovalStatus;
  readonly dayId: string | null;
}

export interface TodayAttendanceOverview {
  readonly workDate: BusinessDate;
  readonly rows: readonly TodayAttendanceRow[];
  readonly reportedCount: number;
  readonly missingCount: number;
  readonly awaitingCount: number;
}

export type MonthlyCellKind =
  | 'approved'
  | 'pending'
  | 'worked'
  | 'absence'
  | 'missing'
  | 'exempt'
  | 'dayOff'
  | 'future'
  | 'void';

export interface MonthlyAttendanceCell {
  readonly workDate: string;
  readonly kind: MonthlyCellKind;
  readonly dayId: string | null;
  readonly hours: number | null;
  readonly projectNames: readonly string[];
}

export interface MonthlyAttendanceEmployeeRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly cells: readonly MonthlyAttendanceCell[];
  readonly missingCount: number;
  readonly reportedCount: number;
}

export interface MonthlyAttendanceGrid {
  readonly yearMonth: string;
  readonly fromDate: BusinessDate;
  readonly toDate: BusinessDate;
  readonly days: readonly string[];
  readonly rows: readonly MonthlyAttendanceEmployeeRow[];
}

function hoursFromClock(clockInAt: Date | null, clockOutAt: Date | null): number | null {
  if (!clockInAt || !clockOutAt) return null;
  const ms = clockOutAt.getTime() - clockInAt.getTime();
  if (ms <= 0) return null;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function sumHours(entries: readonly TimeEntryListItem[]): number | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  return Math.round(total * 100) / 100;
}

function uniqueProjectNames(entries: readonly TimeEntryListItem[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== 'project') continue;
    const name = entry.projectName?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function rollupApproval(entries: readonly TimeEntryListItem[]): TimeApprovalStatus | 'awaiting' {
  if (entries.length === 0) return 'awaiting';
  const statuses = new Set(entries.map((entry) => entry.approvalStatus));
  if (statuses.has('returned')) return 'returned';
  if (statuses.has('draft')) return 'draft';
  if (statuses.has('submitted')) return 'submitted';
  return 'approved';
}

function monthBounds(yearMonth: string): { fromDate: BusinessDate; toDate: BusinessDate; days: string[] } {
  const [yearRaw, monthRaw] = yearMonth.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const fromDate = businessDate(`${yearMonth}-01`);
  const toDate = businessDate(`${yearMonth}-${String(lastDay).padStart(2, '0')}`);
  const days: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    days.push(`${yearMonth}-${String(day).padStart(2, '0')}`);
  }
  return { fromDate, toDate, days };
}

function weekdayUtc(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

async function loadOwnerMonthFacts(
  context: OrgContext,
  fromDate: string,
  toDate: string,
  employeeId?: string,
) {
  const canReadTime =
    hasPermission(context, PERMISSIONS.TIME_MANAGE) ||
    hasPermission(context, PERMISSIONS.TIME_APPROVE) ||
    hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  const [days, timeEntries, outcomes] = await Promise.all([
    listAttendanceDays(context.db, context.organizationId, {
      employeeId,
      fromDate,
      toDate,
      status: 'all',
      limit: ORG_LIST_EXPORT_CAP,
    }),
    canReadTime
      ? listTimeEntries(context.db, context.organizationId, {
          employeeId,
          fromDate,
          toDate,
          status: 'recorded',
          includeArchived: false,
          limit: ORG_LIST_EXPORT_CAP,
        })
      : Promise.resolve([]),
    listAttendanceOutcomesInRange(context, {
      fromDate: businessDate(fromDate),
      toDate: businessDate(toDate),
      employeeId,
    }),
  ]);

  return { days, timeEntries, outcomes };
}

export async function getTodayAttendanceOverview(
  context: OrgContext,
  workDate: string,
): Promise<TodayAttendanceOverview> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const laborDefaults = await getLaborCostDefaultsForApply(context);
  const workWeekdays = resolveOrgWorkWeekdays(laborDefaults);
  const isRequiredWorkday = isConfiguredOrgWorkday(workDate, workWeekdays);

  const employees = await listEmployees(context.db, context.organizationId, {
    status: 'active',
    asOfDate: workDate,
  });
  const { days, timeEntries, outcomes } = await loadOwnerMonthFacts(context, workDate, workDate);

  const dayByEmployee = new Map(days.filter((day) => day.status !== 'void').map((day) => [day.employeeId, day]));
  const outcomeByEmployee = new Map(
    outcomes.map((outcome) => [outcome.employeeId, outcome]),
  );
  const timeByEmployee = new Map<string, TimeEntryListItem[]>();
  for (const entry of timeEntries) {
    const list = timeByEmployee.get(entry.employeeId) ?? [];
    list.push(entry);
    timeByEmployee.set(entry.employeeId, list);
  }

  const rows: TodayAttendanceRow[] = employees
    .filter((employee) => !employee.archivedAt)
    .map((employee) => {
      const day = dayByEmployee.get(employee.id) ?? null;
      const explicitOutcome = outcomeByEmployee.get(employee.id) ?? null;
      const entries = timeByEmployee.get(employee.id) ?? [];
      const attendanceRequired =
        employeeRequiresAttendanceReporting(employee) && isRequiredWorkday;
      const reported =
        !attendanceRequired || day != null || explicitOutcome != null;
      const approval: TodayApprovalStatus = !attendanceRequired
        ? entries.length > 0
          ? rollupApproval(entries)
          : 'approved'
        : reported
          ? explicitOutcome?.outcome === 'not_worked'
            ? 'awaiting'
            : rollupApproval(entries)
          : 'missing';
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        reported,
        projectNames: uniqueProjectNames(entries),
        hours: sumHours(entries) ?? hoursFromClock(day?.clockInAt ?? null, day?.clockOutAt ?? null),
        startTime: day?.clockInAt ?? null,
        attendanceStatus: day?.status ?? null,
        approvalStatus: approval,
        dayId: day?.id ?? null,
      };
    })
    .sort((left, right) => {
      if (left.reported !== right.reported) return left.reported ? -1 : 1;
      return left.employeeName.localeCompare(right.employeeName, 'he');
    });

  return {
    workDate: businessDate(workDate),
    rows,
    reportedCount: rows.filter((row) => row.reported).length,
    missingCount: rows.filter((row) => !row.reported).length,
    awaitingCount: rows.filter((row) => row.approvalStatus === 'awaiting' || row.approvalStatus === 'submitted').length,
  };
}

export async function getMonthlyAttendanceGrid(
  context: OrgContext,
  input: {
    readonly yearMonth: string;
    readonly today: string;
    readonly workWeekdays: readonly number[];
    readonly employeeId?: string;
    readonly missingOnly?: boolean;
  },
): Promise<MonthlyAttendanceGrid> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const { fromDate, toDate, days } = monthBounds(input.yearMonth);
  const workdaySet = new Set(input.workWeekdays);

  const employees = await listEmployees(context.db, context.organizationId, {
    status: 'all',
    asOfDate: toDate,
  });
  const scopedEmployees = employees.filter((employee) => {
    if (employee.archivedAt) return false;
    if (input.employeeId && employee.id !== input.employeeId) return false;
    return employmentOverlapsDateRange(
      {
        hireDate: employee.hireDate ? businessDate(employee.hireDate) : null,
        endDate: employee.endDate ? businessDate(employee.endDate) : null,
      },
      fromDate,
      toDate,
    );
  });

  const { days: attendanceDays, timeEntries, outcomes } = await loadOwnerMonthFacts(
    context,
    fromDate,
    toDate,
    input.employeeId,
  );

  const dayByEmployeeDate = new Map<string, (typeof attendanceDays)[number]>();
  for (const day of attendanceDays) {
    dayByEmployeeDate.set(`${day.employeeId}:${day.workDate}`, day);
  }

  const outcomeByEmployeeDate = new Map<string, (typeof outcomes)[number]>();
  for (const outcome of outcomes) {
    outcomeByEmployeeDate.set(`${outcome.employeeId}:${outcome.workDate}`, outcome);
  }

  const timeByEmployeeDate = new Map<string, TimeEntryListItem[]>();
  for (const entry of timeEntries) {
    const key = `${entry.employeeId}:${entry.workDate}`;
    const list = timeByEmployeeDate.get(key) ?? [];
    list.push(entry);
    timeByEmployeeDate.set(key, list);
  }

  const rows: MonthlyAttendanceEmployeeRow[] = scopedEmployees.map((employee) => {
    const employment = {
      hireDate: employee.hireDate ? businessDate(employee.hireDate) : null,
      endDate: employee.endDate ? businessDate(employee.endDate) : null,
    };
    const cells: MonthlyAttendanceCell[] = days.map((workDate) => {
      const isWorkday = workdaySet.has(weekdayUtc(workDate));
      const day = dayByEmployeeDate.get(`${employee.id}:${workDate}`) ?? null;
      const explicitOutcome = outcomeByEmployeeDate.get(`${employee.id}:${workDate}`) ?? null;
      const entries = timeByEmployeeDate.get(`${employee.id}:${workDate}`) ?? [];
      const hours = sumHours(entries) ?? hoursFromClock(day?.clockInAt ?? null, day?.clockOutAt ?? null);
      const projectNames = uniqueProjectNames(entries);

      if (!isWithinEmploymentRange(businessDate(workDate), employment)) {
        return { workDate, kind: 'exempt', dayId: null, hours, projectNames };
      }

      const attendanceRequired =
        employeeRequiresAttendanceReporting(employee) && isWorkday;

      if (!isWorkday && !day && !explicitOutcome && entries.length === 0) {
        return { workDate, kind: 'dayOff', dayId: null, hours, projectNames };
      }
      if (!attendanceRequired && !day && !explicitOutcome) {
        return {
          workDate,
          kind: workDate > input.today ? 'future' : 'exempt',
          dayId: null,
          hours,
          projectNames,
        };
      }
      if (day?.status === 'void') {
        return { workDate, kind: 'void', dayId: day.id, hours, projectNames };
      }
      if (!day && explicitOutcome) {
        return {
          workDate,
          kind: explicitOutcome.outcome === 'not_worked' ? 'absence' : 'worked',
          dayId: null,
          hours,
          projectNames,
        };
      }
      if (!day) {
        return {
          workDate,
          kind: workDate > input.today ? 'future' : 'missing',
          dayId: null,
          hours,
          projectNames,
        };
      }

      const approval = rollupApproval(entries);
      let kind: MonthlyCellKind = 'worked';
      if (approval === 'approved' || (approval === 'awaiting' && day.status === 'complete')) {
        kind = approval === 'approved' ? 'approved' : 'worked';
      } else if (approval === 'draft' || approval === 'submitted' || approval === 'returned' || day.status === 'open') {
        kind = 'pending';
      }

      return { workDate, kind, dayId: day.id, hours, projectNames };
    });

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      cells,
      missingCount: cells.filter((cell) => cell.kind === 'missing').length,
      reportedCount: cells.filter((cell) => cell.kind !== 'missing' && cell.kind !== 'dayOff' && cell.kind !== 'future' && cell.kind !== 'void').length,
    };
  });

  const filtered = input.missingOnly ? rows.filter((row) => row.missingCount > 0) : rows;
  filtered.sort((left, right) => left.employeeName.localeCompare(right.employeeName, 'he'));

  return {
    yearMonth: input.yearMonth,
    fromDate,
    toDate,
    days,
    rows: filtered,
  };
}

// ---------------------------------------------------------------------------
// Time Allocation Coverage (Task 3): attendance hours vs approved project hours
// ---------------------------------------------------------------------------

export interface AttendanceAllocationCoverageRow {
  readonly employeeId: string;
  readonly employeeName: string;
  /** Sum of (clock_out − clock_in) from attendance events in the period, in hours. */
  readonly attendanceHours: number;
  /** Sum of APPROVED project time-entry hours in the period. */
  readonly allocatedHours: number;
  /**
   * attendanceHours − allocatedHours, floored at 0.
   * Positive → there are attendance hours with no approved project allocation.
   */
  readonly unallocatedHours: number;
  /** True when the employee has at least one non-void attendance day in the period. */
  readonly hasAttendance: boolean;
}

export interface AttendanceAllocationCoverage {
  readonly yearMonth: string;
  readonly rows: readonly AttendanceAllocationCoverageRow[];
  /** Total unallocated hours across all employees. */
  readonly totalUnallocatedHours: number;
  /** Number of employees with unallocated attendance hours. */
  readonly employeesWithUnallocatedCount: number;
}

/**
 * For each employee with attendance in `yearMonth`, compute:
 *   - attendance hours (from clock_in/clock_out events)
 *   - allocated (approved) project time-entry hours
 *   - unallocated = max(0, attendance − allocated)
 *
 * Requires ATTENDANCE_MANAGE or ATTENDANCE_READ.
 */
export async function getAttendanceAllocationCoverage(
  context: OrgContext,
  yearMonth: string,
): Promise<AttendanceAllocationCoverage> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const { fromDate, toDate } = monthBounds(yearMonth);

  const employees = await listEmployees(context.db, context.organizationId, {
    status: 'all',
    asOfDate: toDate,
  });

  const { days: attendanceDays, timeEntries } = await loadOwnerMonthFacts(
    context,
    fromDate,
    toDate,
  );

  // Build per-employee attendance hours from events (clock_in/clock_out pairs).
  const attendanceHoursByEmployee = new Map<string, number>();
  // AttendanceDayListItem has clockInAt / clockOutAt from the repository query.
  for (const day of attendanceDays as AttendanceDayListItem[]) {
    if (day.status === 'void') continue;
    const hours = hoursFromClock(day.clockInAt, day.clockOutAt);
    if (hours != null && hours > 0) {
      const prev = attendanceHoursByEmployee.get(day.employeeId) ?? 0;
      attendanceHoursByEmployee.set(day.employeeId, prev + hours);
    }
  }

  // Per-employee presence (has at least one non-void day).
  const employeesWithAttendance = new Set(
    attendanceDays.filter((d) => d.status !== 'void').map((d) => d.employeeId),
  );

  // Approved project time-entry hours per employee.
  const allocatedHoursByEmployee = new Map<string, number>();
  for (const entry of timeEntries) {
    if (entry.approvalStatus !== 'approved') continue;
    if (entry.kind !== 'project') continue;
    const h = Number(entry.hours) || 0;
    const prev = allocatedHoursByEmployee.get(entry.employeeId) ?? 0;
    allocatedHoursByEmployee.set(entry.employeeId, prev + h);
  }

  const rows: AttendanceAllocationCoverageRow[] = employees
    .filter(
      (emp) => !emp.archivedAt && employeesWithAttendance.has(emp.id),
    )
    .map((emp) => {
      const attendanceHours = Math.round((attendanceHoursByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const allocatedHours = Math.round((allocatedHoursByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const unallocatedHours = Math.max(0, Math.round((attendanceHours - allocatedHours) * 100) / 100);
      return {
        employeeId: emp.id,
        employeeName: emp.name,
        attendanceHours,
        allocatedHours,
        unallocatedHours,
        hasAttendance: true,
      };
    })
    .sort((a, b) => b.unallocatedHours - a.unallocatedHours);

  const totalUnallocatedHours = rows.reduce((sum, row) => sum + row.unallocatedHours, 0);
  const employeesWithUnallocatedCount = rows.filter((row) => row.unallocatedHours > 0).length;

  return {
    yearMonth,
    rows,
    totalUnallocatedHours: Math.round(totalUnallocatedHours * 100) / 100,
    employeesWithUnallocatedCount,
  };
}
