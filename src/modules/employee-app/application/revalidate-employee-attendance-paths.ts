import { revalidatePath } from 'next/cache';

/** Canonical employee clock / history surface (see employee navigation). */
export const EMPLOYEE_ATTENDANCE_CANONICAL_PATH = '/employee/time' as const;

/** Legacy alias that redirects to {@link EMPLOYEE_ATTENDANCE_CANONICAL_PATH}. */
export const EMPLOYEE_ATTENDANCE_ALIAS_PATH = '/employee/attendance' as const;

/** Refresh employee attendance UI after mutations (canonical route + redirect alias). */
export function revalidateEmployeeAttendancePaths(): void {
  revalidatePath(EMPLOYEE_ATTENDANCE_CANONICAL_PATH);
  revalidatePath(EMPLOYEE_ATTENDANCE_ALIAS_PATH);
}
