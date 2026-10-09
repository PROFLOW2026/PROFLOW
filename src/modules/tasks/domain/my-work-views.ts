import type { MyWorkView } from './my-work-view';

/** My Work hub tabs shown in UI (excludes legacy `created_by_me`). */
export const MY_WORK_VIEWS = [
  'today',
  'overdue',
  'this_week',
  'upcoming',
  'waiting',
  'assigned_to_me',
  'following',
  'completed',
  'no_project',
] as const satisfies readonly MyWorkView[];

export type MyWorkHubView = (typeof MY_WORK_VIEWS)[number];

export const DEFAULT_MY_WORK_VIEW: MyWorkHubView = 'today';

const MY_WORK_VIEW_SET = new Set<string>(MY_WORK_VIEWS);

export function parseMyWorkViewParam(
  raw: string | string[] | undefined,
): MyWorkHubView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && MY_WORK_VIEW_SET.has(value)) {
    return value as MyWorkHubView;
  }
  return DEFAULT_MY_WORK_VIEW;
}

/** @deprecated Prefer `parseMyWorkViewParam` — alias for work hub pages. */
export const resolveMyWorkView = parseMyWorkViewParam;
