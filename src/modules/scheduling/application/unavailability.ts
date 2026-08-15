import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { bookingOverlapsUnavailability, inclusiveDatesOverlap } from '../domain/overlap';
import {
  insertUnavailability,
  listOverlappingBookings,
  listOverlappingUnavailability,
} from '../data/scheduling.repository';
import {
  createUnavailabilitySchema,
  type CreateUnavailabilityInput,
} from '../validation/schemas';
import type { EmployeeUnavailabilityRecord } from '../domain/types';
import { assertEmployeeInOrg } from './assert-refs';
import { instantWindowForDates } from '../domain/windows';

export async function createUnavailability(
  context: OrgContext,
  raw: CreateUnavailabilityInput,
): Promise<EmployeeUnavailabilityRecord> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);

  const parsed = createUnavailabilitySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertEmployeeInOrg(context, input.employeeId);

  const otherLeave = await listOverlappingUnavailability(context.db, context.organizationId, {
    employeeId: input.employeeId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const leaveClash = otherLeave.find((row) =>
    inclusiveDatesOverlap(
      { startDate: input.startDate, endDate: input.endDate },
      { startDate: row.startDate, endDate: row.endDate },
    ),
  );
  if (leaveClash) {
    throw new DomainRuleError(
      'Unavailability overlaps existing time off',
      'scheduling.errors.unavailabilityOverlap',
      { unavailabilityId: leaveClash.id },
    );
  }

  const window = instantWindowForDates(
    input.startDate,
    input.endDate,
    context.organization.timezone,
  );
  const bookings = await listOverlappingBookings(context.db, context.organizationId, {
    employeeId: input.employeeId,
    startAt: window.start,
    endAt: window.endExclusive,
  });
  const bookingClash = bookings.find((row) =>
    bookingOverlapsUnavailability(
      { startAt: row.startAt, endAt: row.endAt },
      { startDate: input.startDate, endDate: input.endDate },
      context.organization.timezone,
    ),
  );
  if (bookingClash) {
    throw new DomainRuleError(
      'Unavailability overlaps an existing booking',
      'scheduling.errors.unavailableOverlap',
      { bookingId: bookingClash.id },
    );
  }

  return insertUnavailability(context.db, {
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    startDate: input.startDate,
    endDate: input.endDate,
    kind: input.kind ?? 'leave',
    notes: input.notes ?? null,
  });
}
