/**
 * Canonical attendance page context: one selected employee drives calendar,
 * update forms, and alert deep links via URL search params.
 */

export interface AttendanceEmployeeOption {
  readonly id: string;
  readonly name: string;
}

export function resolveCanonicalAttendanceEmployeeId(
  urlEmployeeId: string | undefined,
  employees: readonly AttendanceEmployeeOption[],
): string | null {
  if (!urlEmployeeId) return null;
  return employees.some((row) => row.id === urlEmployeeId) ? urlEmployeeId : null;
}

export function mergeAttendanceSearchParams(
  current: Readonly<URLSearchParams>,
  patch: {
    readonly employeeId?: string;
    readonly workDate?: string;
    readonly month?: string;
    readonly update?: boolean;
  },
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  if (patch.employeeId !== undefined) {
    if (patch.employeeId) next.set('employeeId', patch.employeeId);
    else next.delete('employeeId');
  }

  if (patch.workDate !== undefined) {
    if (patch.workDate) next.set('workDate', patch.workDate);
    else next.delete('workDate');
  }

  if (patch.month !== undefined) {
    if (patch.month) next.set('month', patch.month);
    else next.delete('month');
  }

  if (patch.update !== undefined) {
    if (patch.update) next.set('update', '1');
    else next.delete('update');
  }

  return next;
}

export function attendanceEmployeeSearchHref(
  pathname: string,
  current: Readonly<URLSearchParams>,
  employeeId: string,
): string {
  const next = mergeAttendanceSearchParams(current, { employeeId, update: true });
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
