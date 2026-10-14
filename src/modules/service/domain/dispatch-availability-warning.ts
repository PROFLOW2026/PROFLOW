/**
 * Dispatch assignee warnings (U05) — advisory only, never blocks scheduling.
 */

export type DispatchAvailabilityWarningCode = 'on_leave' | 'overlapping_booking';

export interface DispatchAvailabilityWarning {
  readonly code: DispatchAvailabilityWarningCode;
}

export function dispatchAvailabilityWarnings(input: {
  readonly hasUnavailability: boolean;
  readonly hasOverlappingBooking: boolean;
}): readonly DispatchAvailabilityWarning[] {
  const warnings: DispatchAvailabilityWarning[] = [];
  if (input.hasUnavailability) warnings.push({ code: 'on_leave' });
  if (input.hasOverlappingBooking) warnings.push({ code: 'overlapping_booking' });
  return warnings;
}
