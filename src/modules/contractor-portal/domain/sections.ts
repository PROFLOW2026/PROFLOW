import type { ExternalContext } from '@/shared/external';
import { holdsRequirement, type PortalCapabilityRequirement } from './capability-requirement';
import type { PortalProjectAccess } from './project-access';
import { isLivePortalHref, type PortalRouteKey } from './routes';

/**
 * Dashboard / project-home sections. A section is visible for a project only when at least one
 * registered provider for it has its capability satisfied by the principal's grants on that project.
 */
export const PORTAL_SECTION_IDS = [
  'today',
  'schedule',
  'acknowledgements',
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
  'notifications',
] as const;

export type PortalSectionId = (typeof PORTAL_SECTION_IDS)[number];

export interface PortalSectionDefinition {
  readonly id: PortalSectionId;
  /** Financial sections may carry amounts; amounts are stripped from every other section. */
  readonly financial: boolean;
  /** "View all" destination inside the project (rendered only when implemented). */
  readonly projectRoute: PortalRouteKey | null;
}

export const PORTAL_SECTIONS: readonly PortalSectionDefinition[] = [
  { id: 'today', financial: false, projectRoute: null },
  { id: 'schedule', financial: false, projectRoute: 'project.schedule' },
  { id: 'acknowledgements', financial: false, projectRoute: null },
  { id: 'tasks', financial: false, projectRoute: 'project.tasks' },
  { id: 'overdueTasks', financial: false, projectRoute: 'project.tasks' },
  { id: 'milestones', financial: false, projectRoute: 'project.schedule' },
  { id: 'planRevisions', financial: false, projectRoute: 'project.plans' },
  { id: 'rfis', financial: false, projectRoute: 'project.rfi' },
  { id: 'defects', financial: false, projectRoute: 'project.defects' },
  { id: 'submittals', financial: false, projectRoute: 'project.submittals' },
  { id: 'claims', financial: true, projectRoute: 'project.claims' },
  { id: 'certifications', financial: true, projectRoute: 'project.claims' },
  { id: 'retention', financial: true, projectRoute: 'project.payments' },
  { id: 'payments', financial: true, projectRoute: 'project.payments' },
  { id: 'cashFlowForecast', financial: true, projectRoute: 'project.claims' },
  { id: 'documents', financial: false, projectRoute: 'project.documents' },
  { id: 'notifications', financial: false, projectRoute: null },
];

export type PortalItemTone = 'neutral' | 'attention' | 'danger' | 'success';

export interface PortalSectionItem {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly subtitle?: string | null;
  /** ISO date (yyyy-mm-dd) or ISO timestamp. */
  readonly dueAt?: string | null;
  /** Full message key (any namespace), e.g. `rfi.status.answered`. */
  readonly statusKey?: string | null;
  readonly tone?: PortalItemTone;
  /** Portal path (`/contractor/...`) of an implemented route. */
  readonly href: string | null;
  /** Only honoured in financial sections. Decimal string, NET. */
  readonly amount?: { readonly value: string; readonly currency: string } | null;
}

export interface PortalSectionMetric {
  /** Full message key (any namespace). */
  readonly labelKey: string;
  readonly value: number;
  readonly tone?: PortalItemTone;
}

export interface PortalSectionSummary {
  /** Total open items in scope (may exceed `items.length`). */
  readonly count: number;
  /** Items needing action now (overdue, awaiting response...). */
  readonly attentionCount: number;
  /** Most relevant items first; providers return at most PORTAL_SECTION_ITEM_LIMIT. */
  readonly items: readonly PortalSectionItem[];
  /** Count breakdown for domains that expose counts rather than item lists. */
  readonly metrics?: readonly PortalSectionMetric[];
}

export const PORTAL_SECTION_ITEM_LIMIT = 5;

export interface PortalProjectTarget {
  readonly organizationId: string;
  readonly projectId: string;
  /** Vendors the principal acts for on this project (contractor A never sees contractor B). */
  readonly vendorIds: readonly string[];
  readonly grantIds: readonly string[];
}

export interface PortalSectionScope {
  /** Only projects where the provider's capability is held. Never empty when `load` is called. */
  readonly targets: readonly PortalProjectTarget[];
  readonly now: Date;
  readonly limit: number;
}

/**
 * Aggregation port implemented once per domain (Track G tasks, H schedule, ...). `load` runs with
 * the principal's RLS-bound executor (`ctx.db`) and must itself re-check scope with
 * `requireExternalScope` / `hasExternalScope` for every target it queries.
 */
export interface PortalSectionProvider {
  readonly id: string;
  readonly section: PortalSectionId;
  readonly capability: PortalCapabilityRequirement;
  load(context: ExternalContext, scope: PortalSectionScope): Promise<PortalSectionSummary>;
}

export interface PortalProviderPlan {
  readonly provider: PortalSectionProvider;
  readonly targets: readonly PortalProjectTarget[];
}

export interface PortalSectionPlan {
  readonly section: PortalSectionDefinition;
  readonly providers: readonly PortalProviderPlan[];
}

export function targetFor(project: PortalProjectAccess): PortalProjectTarget {
  return {
    organizationId: project.organizationId,
    projectId: project.projectId,
    vendorIds: project.vendors.map((vendor) => vendor.vendorId),
    grantIds: project.grantIds,
  };
}

/**
 * Pure capability filter: which providers run, and for which projects. Sections with no runnable
 * provider are omitted entirely (no empty shells for capabilities the principal lacks).
 */
export function planPortalSections(
  projects: readonly PortalProjectAccess[],
  providers: readonly PortalSectionProvider[],
  sections: readonly PortalSectionDefinition[] = PORTAL_SECTIONS,
): readonly PortalSectionPlan[] {
  const plans: PortalSectionPlan[] = [];
  for (const section of sections) {
    const runnable: PortalProviderPlan[] = [];
    for (const provider of providers) {
      if (provider.section !== section.id) continue;
      const targets = projects
        .filter((project) => holdsRequirement(project.capabilities, provider.capability))
        .map(targetFor);
      if (targets.length > 0) runnable.push({ provider, targets });
    }
    if (runnable.length > 0) plans.push({ section, providers: runnable });
  }
  return plans;
}

export interface ComposedPortalSection {
  readonly id: PortalSectionId;
  readonly financial: boolean;
  readonly projectRoute: PortalRouteKey | null;
  readonly count: number;
  readonly attentionCount: number;
  readonly items: readonly PortalSectionItem[];
  readonly metrics: readonly PortalSectionMetric[];
  /** True when at least one provider failed; the section still shows what loaded. */
  readonly partial: boolean;
}

function mergeMetrics(results: readonly PortalSectionSummary[]): PortalSectionMetric[] {
  const merged = new Map<string, PortalSectionMetric>();
  for (const metric of results.flatMap((result) => result.metrics ?? [])) {
    const existing = merged.get(metric.labelKey);
    merged.set(metric.labelKey, existing ? { ...existing, value: existing.value + metric.value } : metric);
  }
  return [...merged.values()];
}

function itemSortKey(item: PortalSectionItem): string {
  return item.dueAt ?? '9999-12-31';
}

/** Merges provider results of one section; strips amounts outside financial sections. */
export function mergeSectionResults(
  section: PortalSectionDefinition,
  results: readonly (PortalSectionSummary | null)[],
  limit: number = PORTAL_SECTION_ITEM_LIMIT,
): ComposedPortalSection {
  const loaded = results.filter((result): result is PortalSectionSummary => result !== null);
  const items = loaded
    .flatMap((result) => result.items)
    .map((item) => ({
      ...item,
      amount: section.financial ? (item.amount ?? null) : null,
      href: isLivePortalHref(item.href) ? item.href : null,
    }))
    .sort((a, b) => itemSortKey(a).localeCompare(itemSortKey(b)))
    .slice(0, limit);
  return {
    id: section.id,
    financial: section.financial,
    projectRoute: section.projectRoute,
    count: loaded.reduce((total, result) => total + result.count, 0),
    attentionCount: loaded.reduce((total, result) => total + result.attentionCount, 0),
    items,
    metrics: mergeMetrics(loaded),
    partial: loaded.length !== results.length,
  };
}
