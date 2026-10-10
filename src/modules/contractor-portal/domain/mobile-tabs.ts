import { buildPortalHref, matchPortalRoute, type PortalRouteKey } from './routes';
import type { PortalNavItem } from './nav';

/** Dashboard (TODAY tab) shows only these composed section ids — not the full 16-section stack. */
export const PORTAL_TODAY_SECTION_IDS = [
  'today',
  'overdueTasks',
  'acknowledgements',
  'notifications',
] as const;

/** On project home, omit sections that duplicate WORK/FINANCE hub module grids. */
export const PORTAL_PROJECT_HOME_SECTION_EXCLUDE = new Set<string>([
  'schedule',
  'tasks',
  'overdueTasks',
  'milestones',
  'planRevisions',
  'rfis',
  'defects',
  'submittals',
  'claims',
  'certifications',
  'retention',
  'payments',
  'cashFlowForecast',
  'documents',
]);

export type PortalTodaySectionId = (typeof PORTAL_TODAY_SECTION_IDS)[number];

export const CONTRACTOR_MOBILE_TAB_KEYS = ['today', 'projects', 'work', 'finance', 'more'] as const;

export type ContractorMobileTabKey = (typeof CONTRACTOR_MOBILE_TAB_KEYS)[number];

interface ContractorMobileTabDefinition {
  readonly key: ContractorMobileTabKey;
  /** Path below `/contractor` (empty string = portal home). */
  readonly path: string;
  readonly labelKey: string;
  readonly iconKey: string;
}

export const CONTRACTOR_MOBILE_TABS: readonly ContractorMobileTabDefinition[] = [
  { key: 'today', path: '', labelKey: 'nav.today', iconKey: 'today' },
  { key: 'projects', path: 'projects', labelKey: 'nav.projects', iconKey: 'projects' },
  { key: 'work', path: 'work', labelKey: 'nav.work', iconKey: 'work' },
  { key: 'finance', path: 'finance', labelKey: 'nav.finance', iconKey: 'finance' },
  { key: 'more', path: 'more', labelKey: 'nav.more', iconKey: 'more' },
];

/** Project list routes highlighted under the PROJECTS tab. */
export const CONTRACTOR_PROJECTS_TAB_ROUTE_KEYS = new Set<PortalRouteKey>(['portal.projects', 'project.home']);

/** Execution modules grouped under WORK (hub + deep links). */
export const CONTRACTOR_WORK_PROJECT_ROUTE_KEYS = new Set<PortalRouteKey>([
  'project.tasks',
  'project.task',
  'project.schedule',
  'project.event',
  'project.rfi',
  'project.rfiDetail',
  'project.submittals',
  'project.submittal',
  'project.defects',
  'project.defect',
  'project.inspections',
  'project.inspection',
  'project.instructions',
  'project.instruction',
  'project.siteLog',
  'project.compliance',
  'project.deliveries',
  'project.safety',
  'project.handover',
  'project.tenders',
  'project.tender',
]);

/** Financial modules grouped under FINANCE (hub + deep links). */
export const CONTRACTOR_FINANCE_PROJECT_ROUTE_KEYS = new Set<PortalRouteKey>([
  'project.claims',
  'project.claim',
  'project.payments',
  'project.contract',
  'project.contractChanges',
]);

/** Routes and portal pages grouped under MORE. */
export const CONTRACTOR_MORE_TAB_ROUTE_KEYS = new Set<PortalRouteKey>([
  'portal.more',
  'account',
  'notifications',
  'project.documents',
  'project.plans',
  'project.plan',
]);

export function buildContractorMobileNavItems(): readonly PortalNavItem[] {
  return CONTRACTOR_MOBILE_TABS.map((tab) => ({
    key: tab.key,
    href: buildPortalHref(tab.path),
    labelKey: tab.labelKey,
  }));
}

export function contractorMobileTabIconKey(tabKey: ContractorMobileTabKey): string {
  return CONTRACTOR_MOBILE_TABS.find((tab) => tab.key === tabKey)?.iconKey ?? tabKey;
}

/** Which bottom / side tab should appear active for a portal pathname. */
export function activeContractorMobileTab(pathname: string): ContractorMobileTabKey {
  const matched = matchPortalRoute(pathname);
  if (matched) {
    if (matched.key === 'dashboard') return 'today';
    if (matched.key === 'portal.projects' || matched.key === 'portal.work' || matched.key === 'portal.finance' || matched.key === 'portal.more') {
      return matched.key.replace('portal.', '') as ContractorMobileTabKey;
    }
    const routeKey = matched.key as PortalRouteKey;
    if (CONTRACTOR_PROJECTS_TAB_ROUTE_KEYS.has(routeKey)) return 'projects';
    if (CONTRACTOR_WORK_PROJECT_ROUTE_KEYS.has(routeKey)) return 'work';
    if (CONTRACTOR_FINANCE_PROJECT_ROUTE_KEYS.has(routeKey)) return 'finance';
    if (CONTRACTOR_MORE_TAB_ROUTE_KEYS.has(routeKey)) return 'more';
  }

  const normalized = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  for (const tab of CONTRACTOR_MOBILE_TABS) {
    const href = buildPortalHref(tab.path);
    if (normalized === href || normalized.startsWith(`${href}/`)) return tab.key;
  }
  return 'today';
}

export function isContractorWorkRouteKey(key: string): boolean {
  return CONTRACTOR_WORK_PROJECT_ROUTE_KEYS.has(key as PortalRouteKey);
}

export function isContractorFinanceRouteKey(key: string): boolean {
  return CONTRACTOR_FINANCE_PROJECT_ROUTE_KEYS.has(key as PortalRouteKey);
}
