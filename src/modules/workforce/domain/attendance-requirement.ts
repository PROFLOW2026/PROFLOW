import type { CompensationClass } from './types';

/**
 * Whether daily attendance reporting is required for alerts, completeness, and missing-day surfaces.
 *
 * Owner/Manager monthly employees accrue compensation without attendance or timesheets.
 * Optional attendance/timesheet use never becomes a required reporting obligation.
 */
export function employeeRequiresAttendanceReporting(input: {
  readonly compensationClass?: CompensationClass | null;
}): boolean {
  return input.compensationClass !== 'owner_manager';
}
