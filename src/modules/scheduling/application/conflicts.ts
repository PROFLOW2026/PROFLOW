import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, DomainRuleError } from '@/shared/errors';
import { bookingOverlapsUnavailability } from '../domain/overlap';
import type { ResourceBookingRecord } from '../domain/types';
import { businessDateInTimeZone } from '../domain/windows';
import {
  listOverlappingBookings,
  listOverlappingUnavailability,
} from '../data/scheduling.repository';

export async function assertBookingSlotAllowed(
  context: OrgContext,
  input: {
    employeeId: string;
    startAt: Date;
    endAt: Date;
    confirmConflict?: boolean;
    excludeBookingId?: string;
  },
): Promise<{ overlappingBookings: ResourceBookingRecord[] }> {
  const tz = context.organization.timezone;
  const startDate = businessDateInTimeZone(input.startAt, tz);
  const endDate = businessDateInTimeZone(new Date(input.endAt.getTime() - 1), tz);
  const unavailability = await listOverlappingUnavailability(
    context.db,
    context.organizationId,
    {
      employeeId: input.employeeId,
      startDate,
      endDate,
    },
  );

  const blocked = unavailability.find((row) =>
    bookingOverlapsUnavailability(
      { startAt: input.startAt, endAt: input.endAt },
      { startDate: row.startDate, endDate: row.endDate },
      tz,
    ),
  );
  if (blocked) {
    throw new DomainRuleError(
      'Employee is unavailable for this time',
      'scheduling.errors.unavailableOverlap',
      { unavailabilityId: blocked.id },
    );
  }

  const overlappingBookings = await listOverlappingBookings(context.db, context.organizationId, {
    employeeId: input.employeeId,
    startAt: input.startAt,
    endAt: input.endAt,
    excludeBookingId: input.excludeBookingId,
  });

  if (overlappingBookings.length > 0 && !input.confirmConflict) {
    throw new ConflictError(
      'This booking overlaps another booking',
      'scheduling.errors.bookingOverlap',
      {
        confirmRequired: true,
        overlappingBookingIds: overlappingBookings.map((row) => row.id),
      },
    );
  }

  return { overlappingBookings };
}
