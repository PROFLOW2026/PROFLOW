import type { ProjectCapability } from '@/modules/project-team';
import { usesExecutionLayer, type DeliveryProfile } from '@/modules/project-profile';
import {
  employeeExecutionPageExists,
  EXECUTION_NAV_PRIORITY,
  EXECUTION_ROUTE_CATALOG,
  type ExecutionNavLinkKey,
  type ExecutionRouteDefinition,
} from './execution-route-catalog';

export interface ExecutionNavLink {
  readonly key: ExecutionNavLinkKey;
  readonly href: string;
}

export interface ExecutionNavInput {
  readonly projectId: string;
  readonly capabilities: ReadonlySet<ProjectCapability>;
  readonly deliveryProfile: DeliveryProfile | null;
  readonly hasSubcontractAgreements: boolean;
  /**
   * Project root for hrefs. Defaults to `/projects/{projectId}`.
   * Employee app passes `/employee/projects/{projectId}` and only links routes that have an employee page.
   */
  readonly surfaceRoot?: string;
}

function capabilityAllowed(
  held: ReadonlySet<ProjectCapability>,
  required: ProjectCapability | readonly ProjectCapability[],
  mode: 'all' | 'any' = 'all',
): boolean {
  const wanted = typeof required === 'string' ? [required] : required;
  if (wanted.length === 0) return true;
  return mode === 'any'
    ? wanted.some((capability) => held.has(capability))
    : wanted.every((capability) => held.has(capability));
}

function routeIsMounted(route: ExecutionRouteDefinition, surfaceRoot: string | undefined): boolean {
  if (surfaceRoot?.startsWith('/employee/')) return employeeExecutionPageExists(route.path);
  return route.pageExists;
}

function resolveHref(
  projectId: string,
  route: ExecutionRouteDefinition,
  surfaceRoot: string | undefined,
): string | null {
  const root = surfaceRoot ?? `/projects/${projectId}`;
  if (!routeIsMounted(route, surfaceRoot)) return null;
  return `${root}/${route.path}`;
}

/** Whether the Execution group chrome should render for this project (before capability filtering). */
export function shouldShowExecutionNavGroup(input: Pick<
  ExecutionNavInput,
  'deliveryProfile' | 'hasSubcontractAgreements'
>): boolean {
  if (input.hasSubcontractAgreements) return true;
  const profile = input.deliveryProfile;
  return profile !== null && usesExecutionLayer(profile);
}

export function selectExecutionNavLinks(input: ExecutionNavInput): ExecutionNavLink[] {
  if (!shouldShowExecutionNavGroup(input)) return [];

  const byKey = new Map(EXECUTION_ROUTE_CATALOG.map((route) => [route.key, route]));
  const links: ExecutionNavLink[] = [];

  for (const key of EXECUTION_NAV_PRIORITY) {
    const route = byKey.get(key);
    if (!route) continue;
    if (!capabilityAllowed(input.capabilities, route.required, route.mode ?? 'all')) continue;

    const href = resolveHref(input.projectId, route, input.surfaceRoot);
    if (!href) continue;

    links.push({ key, href });
  }

  return links;
}

/** Routes in catalog with no page and no fallback (for Track S reports). */
export function executionRoutesMissingPages(): readonly ExecutionNavLinkKey[] {
  return EXECUTION_ROUTE_CATALOG.filter((route) => !route.pageExists).map((route) => route.key);
}
