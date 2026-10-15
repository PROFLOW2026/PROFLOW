import { WORK_TASK_QUERY_KEYS } from './work-task-filter-keys';

/**
 * URL keys for project/workspace board task lists + saved views (listKey=tasks).
 * boardId / projectId are stored in saved views for cross-navigation context;
 * on a board page the path already encodes boardId — query holds filters only.
 */
export const BOARD_TASK_EXTRA_QUERY_KEYS = ['boardId', 'bucketId'] as const;

export const BOARD_TASK_QUERY_KEYS = [
  ...WORK_TASK_QUERY_KEYS,
  ...BOARD_TASK_EXTRA_QUERY_KEYS,
] as const;

export type BoardTaskQueryKey = (typeof BOARD_TASK_QUERY_KEYS)[number];

export function compactBoardTaskQuery(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BOARD_TASK_QUERY_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function boardTaskQueryString(query: Readonly<Record<string, string>>): string {
  const sp = new URLSearchParams();
  for (const key of BOARD_TASK_QUERY_KEYS) {
    const value = query[key];
    if (value) sp.set(key, value);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
