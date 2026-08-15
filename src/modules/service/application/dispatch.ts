import { addDays, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ValidationError } from '@/shared/errors';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findServiceDetailsByProjectId,
  findWorkOrderAssigneeEmployeeId,
  listDispatchRows,
} from '../data/service-details.repository';
import type { DispatchListItem, DispatchWindow } from '../domain/types';
import {
  listDispatchSchema,
  rescheduleWorkOrderSchema,
  type ListDispatchInput,
  type RescheduleWorkOrderInput,
} from '../validation/schemas';
import { upsertWorkOrderDispatchBooking } from './dispatch-booking';
import { updateWorkOrder } from './update-work-order';

/**
 * Convert a calendar day in the org timezone into an approximate UTC instant
 * for the start of that local day (noon-offset probe). Good enough for
 * dispatch window filters; not a full TZ library.
 */
function businessDateToUtcStart(date: BusinessDate, timeZone: string): Date {
  // Probe midday UTC then shift so the formatted local day matches.
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const localY = Number(get('year'));
    const localM = Number(get('month'));
    const localD = Number(get('day'));
    const localH = Number(get('hour'));
    const localMin = Number(get('minute'));
    const localDayMs = Date.UTC(localY, localM - 1, localD);
    const targetDayMs = Date.UTC(y, m - 1, d);
    const dayDeltaMs = targetDayMs - localDayMs;
    const timeOfDayMs = (localH * 60 + localMin) * 60_000;
    guess = guess + dayDeltaMs - timeOfDayMs;
  }
  return new Date(guess);
}

function resolveDispatchRange(
  window: DispatchWindow,
  timezone: string,
): { start: Date; endExclusive: Date } {
  const today = todayInTimeZone(timezone);
  if (window === 'today') {
    return {
      start: businessDateToUtcStart(today, timezone),
      endExclusive: businessDateToUtcStart(addDays(today, 1), timezone),
    };
  }
  if (window === 'tomorrow') {
    const tomorrow = addDays(today, 1);
    return {
      start: businessDateToUtcStart(tomorrow, timezone),
      endExclusive: businessDateToUtcStart(addDays(tomorrow, 1), timezone),
    };
  }
  return {
    start: businessDateToUtcStart(today, timezone),
    endExclusive: businessDateToUtcStart(addDays(today, 7), timezone),
  };
}

export async function listDispatchBoard(
  context: OrgContext,
  rawInput: ListDispatchInput = { window: 'today' },
): Promise<DispatchListItem[]> {
  assertAnyPermission(context, [PERMISSIONS.SERVICE_READ, PERMISSIONS.DISPATCH_MANAGE]);

  const parsed = listDispatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const range = resolveDispatchRange(parsed.data.window, context.organization.timezone);

  return listDispatchRows(context.db, context.organizationId, range, {
    assigneeEmployeeId: parsed.data.assigneeEmployeeId,
    serviceStatus: parsed.data.serviceStatus,
  });
}

/**
 * Dispatch reschedule / reassign. Schedule lives on project_service_details;
 * assignee uses employee_project_assignments (≠ Actual).
 * When an assignee and window are set, upsert a resource_booking (source=work_order).
 */
export async function rescheduleWorkOrder(
  context: OrgContext,
  rawInput: RescheduleWorkOrderInput,
): Promise<void> {
  assertAnyPermission(context, [PERMISSIONS.DISPATCH_MANAGE, PERMISSIONS.SERVICE_MANAGE]);

  const parsed = rescheduleWorkOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const details = await findServiceDetailsByProjectId(
      tx,
      context.organizationId,
      parsed.data.workOrderId,
    );
    const currentAssigneeId = await findWorkOrderAssigneeEmployeeId(
      tx,
      context.organizationId,
      parsed.data.workOrderId,
    );

    const nextStart =
      parsed.data.scheduledStartAt === undefined
        ? (details?.scheduledStartAt ?? null)
        : parseOptionalInstant(parsed.data.scheduledStartAt);
    const nextEnd =
      parsed.data.scheduledEndAt === undefined
        ? (details?.scheduledEndAt ?? null)
        : parseOptionalInstant(parsed.data.scheduledEndAt);
    const nextAssignee =
      parsed.data.assigneeEmployeeId === undefined
        ? currentAssigneeId
        : parsed.data.assigneeEmployeeId;

    await upsertWorkOrderDispatchBooking(txContext, {
      workOrderId: parsed.data.workOrderId,
      assigneeEmployeeId: nextAssignee,
      scheduledStartAt: nextStart,
      scheduledEndAt: nextEnd,
      confirmConflict: parsed.data.confirmConflict,
    });

    await updateWorkOrder(txContext, {
      workOrderId: parsed.data.workOrderId,
      scheduledStartAt: parsed.data.scheduledStartAt,
      scheduledEndAt: parsed.data.scheduledEndAt,
      assigneeEmployeeId: parsed.data.assigneeEmployeeId,
      serviceStatus: parsed.data.serviceStatus,
    });
  });
}

function parseOptionalInstant(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}
