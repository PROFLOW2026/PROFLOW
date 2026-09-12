/**
 * Configured org workweek vs actual attendance on any calendar day.
 *
 * Regular workdays drive missing-attendance alerts and retro bulk fill.
 * Non-standard days (e.g. Friday when org is Sun–Thu) remain open for voluntary work.
 */

/** JS weekday 0=Sun … 6=Sat for a business date (UTC noon anchor). */
export function weekdayFromBusinessDate(workDate: string): number {
  return new Date(`${workDate}T12:00:00Z`).getUTCDay();
}

export function isConfiguredOrgWorkday(
  workDate: string,
  workWeekdays: readonly number[],
): boolean {
  if (workWeekdays.length === 0) return false;
  return workWeekdays.includes(weekdayFromBusinessDate(workDate));
}

/** Whether missing-attendance surfaces should apply on this date. */
export function isRequiredAttendanceWorkday(
  workDate: string,
  workWeekdays: readonly number[],
  compensationClass?: 'standard' | 'owner_manager' | null,
): boolean {
  if (compensationClass === 'owner_manager') return false;
  return isConfiguredOrgWorkday(workDate, workWeekdays);
}
