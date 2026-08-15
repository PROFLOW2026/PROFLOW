import { isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { availabilityForDay } from '../domain/availability';
import {
  DEFAULT_DAY_CAPACITY_HOURS,
  hoursOnBusinessDate,
  resolvePlannedHours,
} from '../domain/capacity';
import { inclusiveDatesOverlap } from '../domain/overlap';
import type { BoardBookingView, BoardDayCell, BoardEmployeeRow, SchedulingBoard } from '../domain/board-view';
import { enumerateBusinessDates, instantWindowForDates } from '../domain/windows';
import {
  listBookingsInWindow,
  listUnavailabilityInWindow,
} from '../data/scheduling.repository';
import { listBoardSchema, type ListBoardInput } from '../validation/schemas';
import {
  ensureEmployeeName,
  loadEmployeeDirectory,
  loadProjectNames,
  projectAssignments,
  projectRecurringBookings,
  projectWorkOrderBookings,
  type ProjectedAssignment,
  type ProjectedBoardBooking,
} from './projections';

export type {
  BoardAssignmentView,
  BoardBookingView,
  BoardDayCell,
  BoardEmployeeRow,
  BoardUnavailabilityView,
  SchedulingBoard,
} from '../domain/board-view';

function toBookingView(item: ProjectedBoardBooking): BoardBookingView {
  return {
    id: item.id,
    projectionKey: item.projectionKey,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    projectId: item.projectId,
    projectName: item.projectName,
    workOrderId: item.workOrderId,
    title: item.title,
    startAt: item.startAt.toISOString(),
    endAt: item.endAt.toISOString(),
    plannedHours: item.plannedHours,
    source: item.source,
    status: item.status,
    notes: item.notes,
    readOnly: item.readOnly,
  };
}

export async function listBoard(
  context: OrgContext,
  raw: ListBoardInput,
): Promise<SchedulingBoard> {
  assertPermission(context, PERMISSIONS.SCHEDULING_READ);

  const parsed = listBoardSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const { from, to } = parsed.data;
  const view = parsed.data.view ?? 'week';
  const tz = context.organization.timezone;
  const days = enumerateBusinessDates(from, to);
  const window = instantWindowForDates(from, to, tz);
  const allowedProjects = await resolveAccessibleProjectIds(context);

  const [persisted, unavailability, directory, projectNames] = await Promise.all([
    listBookingsInWindow(context.db, context.organizationId, window),
    listUnavailabilityInWindow(context.db, context.organizationId, { from, to }),
    loadEmployeeDirectory(context),
    loadProjectNames(context),
  ]);

  const persistedWorkOrderIds = new Set(
    persisted.map((row) => row.workOrderId).filter((id): id is string => Boolean(id)),
  );

  const [workOrderProjections, recurringProjections] = await Promise.all([
    projectWorkOrderBookings(context, window, persistedWorkOrderIds),
    projectRecurringBookings(context, { from, to, ...window }),
  ]);

  const timed: ProjectedBoardBooking[] = [];

  for (const row of persisted) {
    if (!isAccessibleProjectId(allowedProjects, row.projectId ?? row.workOrderId)) continue;
    const employeeName = await ensureEmployeeName(context, directory, row.employeeId);
    const projectName = row.projectId ? (projectNames.get(row.projectId) ?? null) : null;
    const workOrderName = row.workOrderId ? (projectNames.get(row.workOrderId) ?? null) : null;
    timed.push({
      id: row.id,
      projectionKey: `booking:${row.id}`,
      employeeId: row.employeeId,
      employeeName,
      projectId: row.projectId,
      projectName: workOrderName ?? projectName,
      workOrderId: row.workOrderId,
      title: workOrderName ?? projectName,
      startAt: row.startAt,
      endAt: row.endAt,
      plannedHours: resolvePlannedHours(row.startAt, row.endAt, row.plannedHours),
      source: row.source,
      status: row.status,
      notes: row.notes,
      readOnly: false,
    });
  }

  for (const item of [...workOrderProjections, ...recurringProjections]) {
    if (!isAccessibleProjectId(allowedProjects, item.projectId ?? item.workOrderId)) continue;
    const employeeName = await ensureEmployeeName(context, directory, item.employeeId);
    timed.push({ ...item, employeeName });
  }

  const employeeIds = new Set<string>();
  for (const [id] of directory) employeeIds.add(id);
  for (const item of timed) employeeIds.add(item.employeeId);
  for (const row of unavailability) employeeIds.add(row.employeeId);

  const assignments = await projectAssignments(context, [...employeeIds], { from, to });

  const employees: BoardEmployeeRow[] = [];
  const sortedIds = [...employeeIds].sort((a, b) => {
    const left = directory.get(a)?.name ?? a;
    const right = directory.get(b)?.name ?? b;
    return left.localeCompare(right);
  });

  for (const employeeId of sortedIds) {
    const employeeName = await ensureEmployeeName(context, directory, employeeId);
    const employeeDays: BoardDayCell[] = days.map((date) => {
      const dayBookings = timed.filter(
        (item) =>
          item.employeeId === employeeId &&
          hoursOnBusinessDate(item, date, tz) > 0,
      );
      const dayUnavailability = unavailability.filter(
        (row) =>
          row.employeeId === employeeId &&
          inclusiveDatesOverlap(
            { startDate: date, endDate: date },
            { startDate: row.startDate, endDate: row.endDate },
          ),
      );
      const dayAssignments: ProjectedAssignment[] = assignments.filter(
        (row) =>
          row.employeeId === employeeId &&
          isAccessibleProjectId(allowedProjects, row.projectId) &&
          inclusiveDatesOverlap(
            { startDate: date, endDate: date },
            { startDate: row.startDate, endDate: row.endDate ?? '9999-12-31' },
          ),
      );

      const plannedHours = dayBookings.reduce(
        (sum, item) => sum + hoursOnBusinessDate(item, date, tz),
        0,
      );
      const signal = availabilityForDay({
        unavailable: dayUnavailability.length > 0,
        intervals: dayBookings,
        plannedHours,
        capacityHours: DEFAULT_DAY_CAPACITY_HOURS,
      });

      return {
        date,
        signal,
        plannedHours,
        capacityHours: DEFAULT_DAY_CAPACITY_HOURS,
        bookings: dayBookings.map(toBookingView),
        unavailability: dayUnavailability.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          startDate: row.startDate,
          endDate: row.endDate,
          kind: row.kind,
          notes: row.notes,
        })),
        assignments: dayAssignments.map((row) => ({
          assignmentId: row.assignmentId,
          employeeId: row.employeeId,
          projectId: row.projectId,
          projectName: row.projectName,
          startDate: row.startDate,
          endDate: row.endDate,
        })),
      };
    });

    employees.push({ employeeId, employeeName, days: employeeDays });
  }

  return {
    from,
    to,
    view,
    days,
    employees,
    canManage: hasPermission(context, PERMISSIONS.SCHEDULING_MANAGE),
  };
}
