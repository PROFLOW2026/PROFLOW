import type { DispatchListItem, WorkOrderListItem } from '@/modules/service/domain/types';
import type { DailyLogRecord, InspectionRecord, PunchListItemRecord } from '@/modules/field-ops/domain/types';
import type { ProjectListItem } from '@/modules/projects/domain/types';

/** Prefer the worker's assigned dispatch rows when an employee link exists. */
export function filterDispatchForEmployee(
  rows: readonly DispatchListItem[],
  employeeId: string | null,
): DispatchListItem[] {
  if (!employeeId) return [...rows];
  return rows.filter((row) => row.assigneeEmployeeId === employeeId);
}

export function filterWorkOrdersForEmployee(
  rows: readonly WorkOrderListItem[],
  employeeId: string | null,
): WorkOrderListItem[] {
  if (!employeeId) return [...rows];
  return rows.filter((row) => row.assigneeEmployeeId === employeeId);
}

export function filterOpenPunchForEmployee(
  rows: readonly PunchListItemRecord[],
  employeeId: string | null,
): PunchListItemRecord[] {
  const open = rows.filter((row) => row.status === 'open' || row.status === 'in_progress');
  if (!employeeId) return open;
  return open.filter((row) => row.assigneeEmployeeId === employeeId);
}

export function filterInspectionsForToday(
  rows: readonly InspectionRecord[],
  today: string,
): InspectionRecord[] {
  return rows.filter(
    (row) =>
      row.scheduledOn === today ||
      (row.status === 'scheduled' && !row.scheduledOn) ||
      row.status === 'in_progress',
  );
}

export function filterDailyLogsForToday(
  rows: readonly DailyLogRecord[],
  today: string,
): DailyLogRecord[] {
  return rows.filter((row) => row.logDate === today);
}

export function takeRecentProjects(
  rows: readonly ProjectListItem[],
  limit = 8,
): ProjectListItem[] {
  return rows.slice(0, limit);
}
