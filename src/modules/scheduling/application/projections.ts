import { addDays, businessDate } from '@/shared/dates';
import { AuthorizationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listProjectsForOrg } from '@/modules/projects';
import {
  enumerateOccurrenceDates,
  listRecurrenceDefinitionsForOrg,
  listWorkOrdersForOrg,
} from '@/modules/service';
import {
  findEmployeeById,
  listEmployeeProjectLinks,
  listEmployeesForOrg,
} from '@/modules/workforce';
import { startOfDayInTimeZone } from '../domain/windows';
import type { BookingSource, BookingStatus } from '../domain/types';

export interface ProjectedBoardBooking {
  readonly id: string | null;
  readonly projectionKey: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly workOrderId: string | null;
  readonly title: string | null;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly plannedHours: number;
  readonly source: BookingSource;
  readonly status: BookingStatus;
  readonly notes: string | null;
  readonly readOnly: boolean;
}

export interface ProjectedAssignment {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly source: 'assignment';
}

async function swallowUnauthorized<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return fallback;
    // Optional cross-module projections must not fail the board.
    return fallback;
  }
}

export async function loadEmployeeDirectory(
  context: OrgContext,
): Promise<Map<string, { id: string; name: string }>> {
  const directory = new Map<string, { id: string; name: string }>();
  const listed = await swallowUnauthorized(
    () => listEmployeesForOrg(context, { status: 'active' }),
    [],
  );
  for (const employee of listed) {
    directory.set(employee.id, { id: employee.id, name: employee.name });
  }
  return directory;
}

export async function ensureEmployeeName(
  context: OrgContext,
  directory: Map<string, { id: string; name: string }>,
  employeeId: string,
): Promise<string> {
  const known = directory.get(employeeId);
  if (known) return known.name;
  const row = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (row) {
    directory.set(row.id, { id: row.id, name: row.name });
    return row.name;
  }
  return employeeId;
}

export async function loadProjectNames(context: OrgContext): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const projects = await swallowUnauthorized(() => listProjectsForOrg(context, { limit: 200 }), []);
  for (const project of projects) {
    names.set(project.id, project.name);
  }
  return names;
}

/**
 * Work-order schedule windows as read-only bookings (source=work_order).
 * Skips rows already persisted as explicit resource_bookings.
 */
export async function projectWorkOrderBookings(
  context: OrgContext,
  window: { start: Date; endExclusive: Date },
  persistedWorkOrderIds: ReadonlySet<string>,
): Promise<ProjectedBoardBooking[]> {
  if (!hasPermission(context, PERMISSIONS.SERVICE_READ)) return [];

  const orders = await swallowUnauthorized(() => listWorkOrdersForOrg(context, {}), []);
  const items: ProjectedBoardBooking[] = [];

  for (const order of orders) {
    const start = order.service?.scheduledStartAt ?? null;
    const assigneeId = order.assigneeEmployeeId;
    if (!start || !assigneeId) continue;
    if (persistedWorkOrderIds.has(order.id)) continue;

    const end =
      order.service?.scheduledEndAt && order.service.scheduledEndAt > start
        ? order.service.scheduledEndAt
        : new Date(start.getTime() + 60 * 60 * 1000);
    if (start >= window.endExclusive || end <= window.start) continue;

    items.push({
      id: null,
      projectionKey: `work_order:${order.id}`,
      employeeId: assigneeId,
      employeeName: order.assigneeName ?? assigneeId,
      projectId: order.id,
      projectName: order.name,
      workOrderId: order.id,
      title: order.name,
      startAt: start,
      endAt: end,
      plannedHours: (end.getTime() - start.getTime()) / 3_600_000,
      source: 'work_order',
      status: 'planned',
      notes: null,
      readOnly: true,
    });
  }

  return items;
}

/**
 * Recurring service templates clipped to the board window — never an infinite series.
 */
export async function projectRecurringBookings(
  context: OrgContext,
  window: { from: string; to: string; start: Date; endExclusive: Date },
): Promise<ProjectedBoardBooking[]> {
  if (!hasPermission(context, PERMISSIONS.SERVICE_READ)) return [];

  const definitions = await swallowUnauthorized(
    () => listRecurrenceDefinitionsForOrg(context, { status: 'active' }),
    [],
  );
  const items: ProjectedBoardBooking[] = [];
  const maxCount = 40;

  for (const definition of definitions) {
    if (definition.status !== 'active' || !definition.defaultAssigneeEmployeeId) continue;

    const afterExclusive =
      window.from > definition.startDate ? addDays(businessDate(window.from), -1) : null;
    const dates = enumerateOccurrenceDates({
      startDate: definition.startDate,
      endDate: definition.endDate,
      frequency: definition.frequency,
      intervalCount: definition.intervalCount,
      untilInclusive: window.to,
      afterExclusive,
      maxCount,
    }).filter((date) => date >= window.from && date <= window.to);

    const durationMs = (definition.defaultDurationMinutes ?? 8 * 60) * 60 * 1000;
    for (const date of dates) {
      const startAt = new Date(
        startOfDayInTimeZone(date, context.organization.timezone).getTime() + 8 * 3_600_000,
      );
      const endAt = new Date(startAt.getTime() + durationMs);
      if (startAt >= window.endExclusive || endAt <= window.start) continue;
      items.push({
        id: null,
        projectionKey: `recurring:${definition.id}:${date}`,
        employeeId: definition.defaultAssigneeEmployeeId,
        employeeName: definition.defaultAssigneeEmployeeId,
        projectId: null,
        projectName: null,
        workOrderId: null,
        title: definition.title,
        startAt,
        endAt,
        plannedHours: durationMs / 3_600_000,
        source: 'recurring',
        status: 'planned',
        notes: null,
        readOnly: true,
      });
    }
  }

  return items;
}

/** Formal project assignments as planned background (not timed bookings). */
export async function projectAssignments(
  context: OrgContext,
  employeeIds: readonly string[],
  window: { from: string; to: string },
): Promise<ProjectedAssignment[]> {
  if (!hasPermission(context, PERMISSIONS.WORKFORCE_READ)) return [];

  const items: ProjectedAssignment[] = [];
  for (const employeeId of employeeIds) {
    const links = await swallowUnauthorized(() => listEmployeeProjectLinks(context, employeeId), []);
    for (const link of links) {
      if (link.status !== 'active') continue;
      const endDate = link.endDate ?? '9999-12-31';
      if (link.startDate > window.to || endDate < window.from) continue;
      items.push({
        assignmentId: link.membershipId,
        employeeId,
        projectId: link.projectId,
        projectName: link.projectName,
        startDate: link.startDate,
        endDate: link.endDate,
        source: 'assignment',
      });
    }
  }
  return items;
}
