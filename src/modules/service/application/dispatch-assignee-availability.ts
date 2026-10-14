import type { OrgContext } from '@/shared/auth/context';
import { probeEmployeeScheduleOverlap } from '@/modules/scheduling';
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

  const existing = await findActiveWorkOrderBooking(
    context.db,
    context.organizationId,
    workOrderId,
  );

  const { hasUnavailability, hasOverlappingBooking } = await probeEmployeeScheduleOverlap(
    context,
    {
      employeeId: assigneeEmployeeId,
      startAt: scheduledStartAt,
      endAt: scheduledEndAt,
      excludeBookingId: existing?.id,
    },
  );

  return dispatchAvailabilityWarnings({
    hasUnavailability,
    hasOverlappingBooking,
  });
}
