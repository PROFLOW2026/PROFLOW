/**
 * Owner attendance surfaces: today's roster and monthly employee×day grid.
 * Presence stays on attendance days; project / hours / approval come from time entries.
 */

import type { OrgContext } from '@/shared/auth/context';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listAttendanceDays } from '../data/attendance.repository';
import { listEmployees } from '../data/employees.repository';
import { listTimeEntries } from '../data/time-entries.repository';
import type { TimeApprovalStatus, TimeEntryListItem } from '../domain/types';

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
  | 'missing'
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

  const [days, timeEntries] = await Promise.all([
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
  ]);

  return { days, timeEntries };
}

export async function getTodayAttendanceOverview(
  context: OrgContext,
  workDate: string,
): Promise<TodayAttendanceOverview> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const employees = await listEmployees(context.db, context.organizationId, {
    status: 'active',
    asOfDate: workDate,
  });
  const { days, timeEntries } = await loadOwnerMonthFacts(context, workDate, workDate);

  const dayByEmployee = new Map(days.filter((day) => day.status !== 'void').map((day) => [day.employeeId, day]));
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
      const entries = timeByEmployee.get(employee.id) ?? [];
      const reported = day != null;
      const approval: TodayApprovalStatus = reported ? rollupApproval(entries) : 'missing';
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
    status: 'active',
    asOfDate: input.today,
  });
  const scopedEmployees = employees.filter((employee) => {
    if (employee.archivedAt) return false;
    if (input.employeeId) return employee.id === input.employeeId;
    return true;
  });

  const { days: attendanceDays, timeEntries } = await loadOwnerMonthFacts(
    context,
    fromDate,
    toDate,
    input.employeeId,
  );

  const dayByEmployeeDate = new Map<string, (typeof attendanceDays)[number]>();
  for (const day of attendanceDays) {
    dayByEmployeeDate.set(`${day.employeeId}:${day.workDate}`, day);
  }

  const timeByEmployeeDate = new Map<string, TimeEntryListItem[]>();
  for (const entry of timeEntries) {
    const key = `${entry.employeeId}:${entry.workDate}`;
    const list = timeByEmployeeDate.get(key) ?? [];
    list.push(entry);
    timeByEmployeeDate.set(key, list);
  }

  const rows: MonthlyAttendanceEmployeeRow[] = scopedEmployees.map((employee) => {
    const cells: MonthlyAttendanceCell[] = days.map((workDate) => {
      const isWorkday = workdaySet.has(weekdayUtc(workDate));
      const day = dayByEmployeeDate.get(`${employee.id}:${workDate}`) ?? null;
      const entries = timeByEmployeeDate.get(`${employee.id}:${workDate}`) ?? [];
      const hours = sumHours(entries) ?? hoursFromClock(day?.clockInAt ?? null, day?.clockOutAt ?? null);
      const projectNames = uniqueProjectNames(entries);

      if (!isWorkday) {
        return { workDate, kind: 'dayOff', dayId: day?.id ?? null, hours, projectNames };
      }
      if (day?.status === 'void') {
        return { workDate, kind: 'void', dayId: day.id, hours, projectNames };
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
