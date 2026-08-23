/**
 * Attendance clock state machine.
 *
 * Attendance ≠ project time ≠ Actual. Presence events never create labor cost.
 * Corrections void events (or void + replace); history is not silently rewritten.
 */

import { DomainRuleError } from '@/shared/errors';

export const ATTENDANCE_EVENT_TYPES = [
  'clock_in',
  'clock_out',
  'break_start',
  'break_end',
] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export const ATTENDANCE_DAY_STATUSES = ['open', 'complete', 'void'] as const;
export type AttendanceDayStatus = (typeof ATTENDANCE_DAY_STATUSES)[number];

export const ATTENDANCE_EVENT_SOURCES = ['self', 'manager', 'manual', 'system'] as const;
export type AttendanceEventSource = (typeof ATTENDANCE_EVENT_SOURCES)[number];

/** Derived presence from active (non-voided) events - not a persisted column. */
export const CLOCK_PRESENCE_STATES = ['absent', 'clocked_in', 'on_break'] as const;
export type ClockPresenceState = (typeof CLOCK_PRESENCE_STATES)[number];

export interface AttendanceEventLike {
  readonly eventType: AttendanceEventType;
  readonly occurredAt: Date | string;
  readonly voidedAt?: Date | string | null;
}

function toMillis(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Active events in chronological order (stable for equal timestamps). */
export function listActiveAttendanceEvents(
  events: readonly AttendanceEventLike[],
): AttendanceEventLike[] {
  return events
    .filter((event) => event.voidedAt == null)
    .slice()
    .sort((left, right) => toMillis(left.occurredAt) - toMillis(right.occurredAt));
}

/**
 * Fold active events into current presence.
 * Invalid sequences are ignored for transitions that do not apply
 * (e.g. break_start while absent leaves state unchanged).
 */
export function resolveClockPresenceState(
  events: readonly AttendanceEventLike[],
): ClockPresenceState {
  let state: ClockPresenceState = 'absent';

  for (const event of listActiveAttendanceEvents(events)) {
    switch (event.eventType) {
      case 'clock_in':
        if (state === 'absent') state = 'clocked_in';
        break;
      case 'clock_out':
        if (state === 'clocked_in' || state === 'on_break') state = 'absent';
        break;
      case 'break_start':
        if (state === 'clocked_in') state = 'on_break';
        break;
      case 'break_end':
        if (state === 'on_break') state = 'clocked_in';
        break;
      default:
        break;
    }
  }

  return state;
}

export function canClockIn(state: ClockPresenceState): boolean {
  return state === 'absent';
}

/** Clock-out is allowed while clocked in or on break (ends the open shift). */
export function canClockOut(state: ClockPresenceState): boolean {
  return state === 'clocked_in' || state === 'on_break';
}

export function canStartBreak(state: ClockPresenceState): boolean {
  return state === 'clocked_in';
}

export function canEndBreak(state: ClockPresenceState): boolean {
  return state === 'on_break';
}

export function assertCanAppendClockEvent(
  state: ClockPresenceState,
  eventType: 'clock_in' | 'clock_out',
): void {
  if (eventType === 'clock_in' && !canClockIn(state)) {
    throw new DomainRuleError('Already clocked in', 'workforce.errors.alreadyClockedIn');
  }
  if (eventType === 'clock_out' && !canClockOut(state)) {
    throw new DomainRuleError('Not clocked in', 'workforce.errors.notClockedIn');
  }
}

/**
 * Day status after the latest active events (void days stay void).
 * - open: currently present, or day exists with no completed out
 * - complete: at least one clock_in and currently absent
 */
export function deriveAttendanceDayStatus(
  events: readonly AttendanceEventLike[],
  currentStatus: AttendanceDayStatus = 'open',
): AttendanceDayStatus {
  if (currentStatus === 'void') return 'void';

  const active = listActiveAttendanceEvents(events);
  if (active.length === 0) return 'open';

  const presence = resolveClockPresenceState(active);
  if (presence !== 'absent') return 'open';

  const hadClockIn = active.some((event) => event.eventType === 'clock_in');
  return hadClockIn ? 'complete' : 'open';
}
