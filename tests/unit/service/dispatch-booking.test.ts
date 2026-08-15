import { describe, expect, it } from 'vitest';
import {
  resolveDispatchBookingUpsert,
  resolveDispatchWindowEnd,
} from '@/modules/service/domain/dispatch-booking';

describe('resolveDispatchWindowEnd', () => {
  it('uses the provided end when it is after start', () => {
    const start = new Date('2026-08-15T08:00:00.000Z');
    const end = new Date('2026-08-15T12:00:00.000Z');
    expect(resolveDispatchWindowEnd(start, end)).toEqual(end);
  });

  it('defaults to one hour when end is missing or not after start', () => {
    const start = new Date('2026-08-15T08:00:00.000Z');
    expect(resolveDispatchWindowEnd(start, null)).toEqual(new Date('2026-08-15T09:00:00.000Z'));
    expect(resolveDispatchWindowEnd(start, start)).toEqual(new Date('2026-08-15T09:00:00.000Z'));
  });
});

describe('resolveDispatchBookingUpsert', () => {
  const start = new Date('2026-08-15T08:00:00.000Z');
  const end = new Date('2026-08-15T12:00:00.000Z');
  const employeeId = '11111111-1111-4111-8111-111111111111';
  const bookingId = '22222222-2222-4222-8222-222222222222';

  it('inserts a work-order booking when assigning a window', () => {
    expect(
      resolveDispatchBookingUpsert({
        existingBookingId: null,
        assigneeEmployeeId: employeeId,
        scheduledStartAt: start,
        scheduledEndAt: end,
      }),
    ).toEqual({
      action: 'insert',
      employeeId,
      startAt: start,
      endAt: end,
    });
  });

  it('updates the existing work-order booking on reschedule', () => {
    const nextStart = new Date('2026-08-16T09:00:00.000Z');
    expect(
      resolveDispatchBookingUpsert({
        existingBookingId: bookingId,
        assigneeEmployeeId: employeeId,
        scheduledStartAt: nextStart,
        scheduledEndAt: null,
      }),
    ).toEqual({
      action: 'update',
      bookingId,
      employeeId,
      startAt: nextStart,
      endAt: new Date('2026-08-16T10:00:00.000Z'),
    });
  });

  it('cancels the persisted booking when assignee or window is cleared', () => {
    expect(
      resolveDispatchBookingUpsert({
        existingBookingId: bookingId,
        assigneeEmployeeId: null,
        scheduledStartAt: start,
        scheduledEndAt: end,
      }),
    ).toEqual({ action: 'cancel', bookingId });
  });

  it('skips when there is no assignee window and no existing booking', () => {
    expect(
      resolveDispatchBookingUpsert({
        existingBookingId: null,
        assigneeEmployeeId: employeeId,
        scheduledStartAt: null,
        scheduledEndAt: end,
      }),
    ).toEqual({ action: 'skip' });
  });
});
