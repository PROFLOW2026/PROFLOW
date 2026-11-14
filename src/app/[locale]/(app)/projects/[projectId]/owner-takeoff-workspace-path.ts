const LOCALE_PREFIXES = new Set(['he-IL', 'he', 'en', 'ar', 'ru']);

function stripLocalePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && LOCALE_PREFIXES.has(parts[0]!)) {
    return `/${parts.slice(1).join('/')}`;
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

/** True on owner electrical takeoff list and workspace routes (no commercial project chrome). */
export function isOwnerTakeoffWorkspacePath(pathname: string, projectId: string): boolean {
  const path = stripLocalePrefix(pathname);
  const prefix = `/projects/${projectId}/takeoff`;
  return path === prefix || path.startsWith(`${prefix}/`);
}