/**
 * Resource scheduling domain types. Framework-free — no React, no persistence.
 *
 * Bookings occupy employee time. Unavailability is a hard calendar block.
 * Assignments and work-order windows may appear as read-only projections.
 */

export const BOOKING_SOURCES = ['manual', 'work_order', 'assignment', 'recurring'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const BOOKING_STATUSES = ['planned', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const UNAVAILABILITY_KINDS = ['leave', 'unavailable', 'holiday'] as const;
export type UnavailabilityKind = (typeof UNAVAILABILITY_KINDS)[number];

/**
 * Per-employee, per-day availability. Severity order is used when combining
 * signals: unavailable > conflict > over_capacity > fully_booked > partially_booked > available.
 */
export const AVAILABILITY_SIGNALS = [
  'available',
  'partially_booked',
  'fully_booked',
  'conflict',
  'over_capacity',
  'unavailable',
] as const;
export type AvailabilitySignal = (typeof AVAILABILITY_SIGNALS)[number];

/** Alias kept for copy / tests — same signal as `over_capacity`. */
export type OvertimeSignal = 'over_capacity';

export const SCHEDULING_VIEWS = ['day', 'week'] as const;
export type SchedulingView = (typeof SCHEDULING_VIEWS)[number];

export interface ResourceBookingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly projectId: string | null;
  readonly workOrderId: string | null;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly plannedHours: string | null;
  readonly source: BookingSource;
  readonly status: BookingStatus;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EmployeeUnavailabilityRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly kind: UnavailabilityKind;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Interval {
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface InclusiveDateRange {
  readonly startDate: string;
  readonly endDate: string;
}
