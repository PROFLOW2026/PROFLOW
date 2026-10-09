import { EXECUTION_HUBS, EXECUTION_HUB_CHILDREN } from './execution-hubs';

const LOCALE_PREFIXES = new Set(['he-IL', 'he', 'en', 'ar', 'ru']);

const EXTRA_EXECUTION_SEGMENTS = [
  'contractors',
  'claims',
  'activity',
  'structure',
  'contractor-access',
  'tenders',
  'timeline',
  'boards',
] as const;

function buildExecutionSegmentSet(): ReadonlySet<string> {
  const segments = new Set<string>();
  for (const hub of EXECUTION_HUBS) segments.add(hub.path);
  for (const child of EXECUTION_HUB_CHILDREN) segments.add(child.path);
  for (const segment of EXTRA_EXECUTION_SEGMENTS) segments.add(segment);
  return segments;
}

const EXECUTION_SEGMENTS = buildExecutionSegmentSet();

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

/** True when the URL is the commercial project home (`/projects/{id}` only). */
export function isCommercialProjectHomePath(pathname: string, projectId: string): boolean {
  const path = stripLocalePrefix(pathname);
  const prefix = `/projects/${projectId}`;
  return path === prefix || path === `${prefix}/`;
}

export function isOwnerExecutionWorkspacePath(pathname: string, projectId: string): boolean {
  const segment = firstSegmentAfterProject(pathname, `/projects/${projectId}`);
  if (!segment) return false;
  return EXECUTION_SEGMENTS.has(segment);
}

export function isEmployeeExecutionWorkspacePath(pathname: string, projectId: string): boolean {
  const segment = firstSegmentAfterProject(pathname, `/employee/projects/${projectId}`);
  if (!segment) return false;
  return EXECUTION_SEGMENTS.has(segment);
}
