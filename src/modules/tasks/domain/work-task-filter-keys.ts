/**
 * URL query keys shared across /work/board, /work/calendar, /work/timeline
 * and saved list views (listKey=tasks).
 */
export const WORK_TASK_QUERY_KEYS = [
  'projectId',
  'clientId',
  'assigneeOrgMemberId',
  'assigneeEmployeeId',
  'status',
  'priority',
  'labelId',
  'search',
  'dueFrom',
  'dueTo',
  'overdue',
  'blocked',
  'noProject',
] as const;

export type WorkTaskQueryKey = (typeof WORK_TASK_QUERY_KEYS)[number];

export function compactWorkTaskQuery(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of WORK_TASK_QUERY_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function workTaskQueryString(query: Readonly<Record<string, string>>): string {
  const sp = new URLSearchParams();
  for (const key of WORK_TASK_QUERY_KEYS) {
    const value = query[key];
    if (value) sp.set(key, value);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
