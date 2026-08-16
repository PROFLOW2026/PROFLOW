/**
 * Dispatch → resource_booking write-through.
 * Persist a source=work_order booking for the assignee window.
 * Not Microsoft Project / CPM - scheduling already owns conflict checks.
 */

export type DispatchBookingUpsert =
  | { readonly action: 'skip' }
  | {
      readonly action: 'insert';
      readonly employeeId: string;
      readonly startAt: Date;
      readonly endAt: Date;
    }
  | {
      readonly action: 'update';
      readonly bookingId: string;
      readonly employeeId: string;
      readonly startAt: Date;
      readonly endAt: Date;
    }
  | { readonly action: 'cancel'; readonly bookingId: string };

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

export function resolveDispatchWindowEnd(startAt: Date, endAt: Date | null): Date {
  if (endAt && endAt.getTime() > startAt.getTime()) return endAt;
  return new Date(startAt.getTime() + DEFAULT_WINDOW_MS);
}

export function resolveDispatchBookingUpsert(input: {
  readonly existingBookingId: string | null;
  readonly assigneeEmployeeId: string | null;
  readonly scheduledStartAt: Date | null;
  readonly scheduledEndAt: Date | null;
}): DispatchBookingUpsert {
  const hasWindow = Boolean(input.assigneeEmployeeId && input.scheduledStartAt);

  if (!hasWindow) {
    if (input.existingBookingId) {
      return { action: 'cancel', bookingId: input.existingBookingId };
    }
    return { action: 'skip' };
  }

  const employeeId = input.assigneeEmployeeId as string;
  const startAt = input.scheduledStartAt as Date;
  const endAt = resolveDispatchWindowEnd(startAt, input.scheduledEndAt);

  if (input.existingBookingId) {
    return {
      action: 'update',
      bookingId: input.existingBookingId,
      employeeId,
      startAt,
      endAt,
    };
  }

  return { action: 'insert', employeeId, startAt, endAt };
}
