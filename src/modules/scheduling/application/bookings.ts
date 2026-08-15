import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  cancelBookingSchema,
  createBookingSchema,
  updateBookingSchema,
  type CancelBookingInput,
  type CreateBookingInput,
  type UpdateBookingInput,
} from '../validation/schemas';
import {
  findBookingById,
  insertBooking,
  updateBookingById,
} from '../data/scheduling.repository';
import { isOverCapacity, occupiedBusinessDates, resolvePlannedHours } from '../domain/capacity';
import type { ResourceBookingRecord } from '../domain/types';
import { assertEmployeeInOrg, assertOptionalProjectRefs } from './assert-refs';
import { assertBookingSlotAllowed } from './conflicts';

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export interface MutateBookingResult {
  readonly booking: ResourceBookingRecord;
  readonly overlappingBookingIds: readonly string[];
  readonly overCapacity: boolean;
}

export async function createBooking(
  context: OrgContext,
  raw: CreateBookingInput,
): Promise<MutateBookingResult> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);
  const input = parseOrThrow(createBookingSchema.safeParse(raw));

  await assertEmployeeInOrg(context, input.employeeId);
  await assertOptionalProjectRefs(context, input);

  const { overlappingBookings } = await assertBookingSlotAllowed(context, {
    employeeId: input.employeeId,
    startAt: input.startAt,
    endAt: input.endAt,
    confirmConflict: input.confirmConflict,
  });

  const plannedHours = resolvePlannedHours(input.startAt, input.endAt, input.plannedHours);
  const dayCount = occupiedBusinessDates(
    { startAt: input.startAt, endAt: input.endAt },
    context.organization.timezone,
  ).length;
  const source = input.workOrderId ? 'work_order' : 'manual';

  const booking = await insertBooking(context.db, {
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    projectId: input.projectId ?? null,
    workOrderId: input.workOrderId ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    plannedHours,
    source,
    status: input.status === 'cancelled' ? 'planned' : (input.status ?? 'planned'),
    notes: input.notes ?? null,
  });

  return {
    booking,
    overlappingBookingIds: overlappingBookings.map((row) => row.id),
    overCapacity: isOverCapacity(plannedHours, Math.max(1, dayCount)),
  };
}

export async function updateBooking(
  context: OrgContext,
  raw: UpdateBookingInput,
): Promise<MutateBookingResult> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);
  const input = parseOrThrow(updateBookingSchema.safeParse(raw));

  const existing = await findBookingById(context.db, context.organizationId, input.bookingId);
  if (!existing || existing.archivedAt) throw new NotFoundError('Booking');
  if (existing.status === 'cancelled') {
    throw new DomainRuleError('Cancelled bookings cannot be changed', 'scheduling.errors.cancelledLocked');
  }

  const employeeId = input.employeeId ?? existing.employeeId;
  const startAt = input.startAt ?? existing.startAt;
  const endAt = input.endAt ?? existing.endAt;
  const projectId = input.projectId === undefined ? existing.projectId : input.projectId;
  const workOrderId = input.workOrderId === undefined ? existing.workOrderId : input.workOrderId;

  await assertEmployeeInOrg(context, employeeId);
  await assertOptionalProjectRefs(context, { projectId, workOrderId });

  const { overlappingBookings } = await assertBookingSlotAllowed(context, {
    employeeId,
    startAt,
    endAt,
    confirmConflict: input.confirmConflict,
    excludeBookingId: existing.id,
  });

  const plannedHours =
    input.plannedHours !== undefined
      ? resolvePlannedHours(startAt, endAt, input.plannedHours)
      : resolvePlannedHours(startAt, endAt, existing.plannedHours);

  const updated = await updateBookingById(context.db, context.organizationId, existing.id, {
    employeeId,
    projectId,
    workOrderId,
    startAt,
    endAt,
    plannedHours,
    notes: input.notes === undefined ? undefined : input.notes,
    status: input.status,
  });
  if (!updated) throw new NotFoundError('Booking');

  const dayCount = occupiedBusinessDates(
    { startAt, endAt },
    context.organization.timezone,
  ).length;

  return {
    booking: updated,
    overlappingBookingIds: overlappingBookings.map((row) => row.id),
    overCapacity: isOverCapacity(plannedHours, Math.max(1, dayCount)),
  };
}

export async function cancelBooking(
  context: OrgContext,
  raw: CancelBookingInput,
): Promise<ResourceBookingRecord> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);
  const input = parseOrThrow(cancelBookingSchema.safeParse(raw));

  const existing = await findBookingById(context.db, context.organizationId, input.bookingId);
  if (!existing || existing.archivedAt) throw new NotFoundError('Booking');
  if (existing.status === 'cancelled') return existing;

  const updated = await updateBookingById(context.db, context.organizationId, existing.id, {
    status: 'cancelled',
  });
  if (!updated) throw new NotFoundError('Booking');
  return updated;
}
