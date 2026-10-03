import { holdsRequirement } from './capability-requirement';
import { buildPortalHref, PORTAL_ROUTES, type PortalRouteDefinition } from './routes';

export interface PortalNavItem {
  readonly key: string;
  readonly href: string;
  /** Key inside the `contractorPortal` namespace. */
  readonly labelKey: string;
}

/** Portal-level destinations (dashboard, notifications, account) that exist on disk. */
export function buildPortalPrimaryNav(
  routes: readonly PortalRouteDefinition[] = PORTAL_ROUTES,
): readonly PortalNavItem[] {
  return routes
    .filter((definition) => definition.scope === 'portal' && definition.placement === 'primary')
    .filter((definition) => definition.implemented)
    .map((definition) => ({
      key: definition.key,
      href: buildPortalHref(definition.path),
      labelKey: definition.labelKey,
    }));
}

/**
 * Project navigation for one project: implemented list pages whose capability the principal holds
 * for that project. Detail and auth routes never appear.
 */
export function buildPortalProjectNav(
  projectId: string,
  capabilities: ReadonlySet<string>,
  routes: readonly PortalRouteDefinition[] = PORTAL_ROUTES,
): readonly PortalNavItem[] {
  return routes
    .filter((definition) => definition.scope === 'project' && definition.placement === 'project')
    .filter((definition) => definition.implemented)
    .filter((definition) => holdsRequirement(capabilities, definition.capability))
    .map((definition) => ({
      key: definition.key,
      href: buildPortalHref(definition.path, { projectId }),
      labelKey: definition.labelKey,
    }));
}

/** Longest-prefix match so `/contractor/projects/x/tasks/1` highlights "tasks", not "project home". */
export function activePortalNavKey(pathname: string, items: readonly PortalNavItem[]): string | null {
  let best: PortalNavItem | null = null;
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key ?? null;
}

/**
 * Mobile bottom-nav order: dashboard, then the active project's pages, then the remaining
 * portal destinations. More than `slots` items -> first `slots - 1` + a "More" sheet.
 */
export function splitBottomNav(
  primary: readonly PortalNavItem[],
  projectItems: readonly PortalNavItem[],
  slots = 5,
): { readonly visible: readonly PortalNavItem[]; readonly overflow: readonly PortalNavItem[] } {
  const dashboard = primary.filter((item) => item.key === 'dashboard');
  const rest = primary.filter((item) => item.key !== 'dashboard');
  const ordered = [...dashboard, ...projectItems, ...rest];
  if (ordered.length <= slots) return { visible: ordered, overflow: [] };
  return { visible: ordered.slice(0, slots - 1), overflow: ordered.slice(slots - 1) };
}

const PROJECT_PATH = /^\/contractor\/projects\/([^/]+)(?:\/|$)/;

/** Project id of the current portal path (layouts cannot read child params). */
export function projectIdFromPortalPath(pathname: string): string | null {
  const match = PROJECT_PATH.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}
