const LOCALE_PREFIXES = new Set(['he-IL', 'he', 'en', 'ar', 'ru']);

/** First URL segment after `/projects/{id}/` for the project task work area. */
export const PROJECT_WORK_WORKSPACE_SEGMENTS = [
  'tasks',
  'boards',
  'calendar',
  'timeline',
  /** Linked from project-work nav (meetings); layout uses work chrome, not execution hubs. */
  'site-meetings',
] as const;

const PROJECT_WORK_SEGMENT_SET = new Set<string>(PROJECT_WORK_WORKSPACE_SEGMENTS);

function stripLocalePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && LOCALE_PREFIXES.has(parts[0]!)) {
    return `/${parts.slice(1).join('/')}`;
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function firstSegmentAfterProject(pathname: string, projectPrefix: string): string | null {
  const path = stripLocalePrefix(pathname);
  if (path === projectPrefix || path === `${projectPrefix}/`) return null;
  if (!path.startsWith(`${projectPrefix}/`)) return null;
  const remainder = path.slice(projectPrefix.length + 1);
  const first = remainder.split('/')[0];
  return first ?? null;
}

/** True on project-scoped UWM routes (tasks, boards, calendar, timeline). */
export function isOwnerProjectWorkWorkspacePath(pathname: string, projectId: string): boolean {
  const segment = firstSegmentAfterProject(pathname, `/projects/${projectId}`);
  if (!segment) return false;
  return PROJECT_WORK_SEGMENT_SET.has(segment);
}

const EMPLOYEE_PROJECT_WORK_SEGMENT_SET = new Set<string>([
  ...PROJECT_WORK_WORKSPACE_SEGMENTS,
  'board',
]);

/** True on employee project-scoped task routes (tasks, board, calendar). */
export function isEmployeeProjectWorkWorkspacePath(pathname: string, projectId: string): boolean {
  const segment = firstSegmentAfterProject(pathname, `/employee/projects/${projectId}`);
  if (!segment) return false;
  return EMPLOYEE_PROJECT_WORK_SEGMENT_SET.has(segment);
}
