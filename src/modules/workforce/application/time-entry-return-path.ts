export const EMPLOYEE_TIME_ENTRIES_PATH = '/employee/hours' as const;

export type TimeEntrySuccessPath = '/workforce/time' | typeof EMPLOYEE_TIME_ENTRIES_PATH;

/** Resolve post-save redirect from optional hidden form field. */
export function resolveTimeEntryReturnPath(formData: FormData): TimeEntrySuccessPath {
  const raw = formData.get('returnPath');
  return raw === EMPLOYEE_TIME_ENTRIES_PATH ? EMPLOYEE_TIME_ENTRIES_PATH : '/workforce/time';
}
