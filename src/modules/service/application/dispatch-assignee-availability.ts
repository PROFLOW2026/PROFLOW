import type { OrgContext } from '@/shared/auth/context';
import { bookingOverlapsUnavailability } from '@/modules/scheduling/domain/overlap';
import { businessDateInTimeZone } from '@/modules/scheduling/domain/windows';
import {
  listOverlappingBookings,
  listOverlappingUnavailability,
} from '@/modules/scheduling/data/scheduling.repository';
import { findActiveWorkOrderBooking } from '@/modules/scheduling/lookups';
import {
  dispatchAvailabilityWarnings,
  type DispatchAvailabilityWarning,
} from '../domain/dispatch-availability-warning';

/** Advisory only (U05) — does not block dispatch reschedule. */
export async function evaluateDispatchAssigneeAvailability(
  context: OrgContext,
  input: {
    readonly workOrderId: string;
    readonly assigneeEmployeeId: string | null;
    readonly scheduledStartAt: Date | null;
    readonly scheduledEndAt: Date | null;
  },
): Promise<readonly DispatchAvailabilityWarning[]> {
  const { assigneeEmployeeId, scheduledStartAt, scheduledEndAt, workOrderId } = input;
  if (!assigneeEmployeeId || !scheduledStartAt || !scheduledEndAt) {
    return [];
  }
  if (scheduledEndAt.getTime() <= scheduledStartAt.getTime()) {
    return [];
  }

  const tz = context.organization.timezone;
  const startDate = businessDateInTimeZone(scheduledStartAt, tz);
  const endDate = businessDateInTimeZone(new Date(scheduledEndAt.getTime() - 1), tz);

  const unavailability = await listOverlappingUnavailability(context.db, context.organizationId, {
    employeeId: assigneeEmployeeId,
    startDate,
    endDate,
  });
  const hasUnavailability = unavailability.some((row) =>
    bookingOverlapsUnavailability(
      { startAt: scheduledStartAt, endAt: scheduledEndAt },
      { startDate: row.startDate, endDate: row.endDate },
      tz,
    ),
  );

  const existing = await findActiveWorkOrderBooking(
    context.db,
    context.organizationId,
    workOrderId,
  );

  const overlappingBookings = await listOverlappingBookings(context.db, context.organizationId, {
    employeeId: assigneeEmployeeId,
    startAt: scheduledStartAt,
    endAt: scheduledEndAt,
    excludeBookingId: existing?.id,
  });

  return dispatchAvailabilityWarnings({
    hasUnavailability,
    hasOverlappingBooking: overlappingBookings.length > 0,
  });
}
