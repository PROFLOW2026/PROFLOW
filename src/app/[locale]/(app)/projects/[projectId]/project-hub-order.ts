import type { ProjectTabKey } from './project-tab-order';
import type { ProjectTabVisibility } from './project-tab-order';

/** Top-level project workspace hubs (owner-facing). */
export type ProjectHubKey = 'overview' | 'money' | 'work' | 'documents' | 'details';

export const PROJECT_HUB_PRIORITY: readonly ProjectHubKey[] = [
  'overview',
  'money',
  'work',
  'documents',
  'details',
] as const;

/** Legacy ?tab= values mapped to hub + inner section. */
export const LEGACY_TAB_TO_HUB: Readonly<
  Record<ProjectTabKey, { readonly hub: ProjectHubKey; readonly section: ProjectTabKey }>
> = {
  overview: { hub: 'overview', section: 'overview' },
  financials: { hub: 'money', section: 'financials' },
  expenses: { hub: 'money', section: 'expenses' },
  budgets: { hub: 'money', section: 'budgets' },
  billing: { hub: 'money', section: 'billing' },
  billingPlan: { hub: 'money', section: 'billingPlan' },
  changes: { hub: 'work', section: 'changes' },
  boq: { hub: 'work', section: 'boq' },
  work: { hub: 'work', section: 'work' },
  team: { hub: 'work', section: 'team' },
  time: { hub: 'work', section: 'time' },
  schedule: { hub: 'work', section: 'schedule' },
  usage: { hub: 'work', section: 'usage' },
  documents: { hub: 'documents', section: 'documents' },
  closeout: { hub: 'details', section: 'closeout' },
  warranty: { hub: 'details', section: 'warranty' },
  details: { hub: 'details', section: 'details' },
};

/** Inner sections per hub, in display order. */
export const HUB_SECTION_PRIORITY: Readonly<Record<ProjectHubKey, readonly ProjectTabKey[]>> = {
  overview: ['overview'],
  money: ['financials', 'expenses', 'billing', 'billingPlan', 'budgets'],
  work: ['work', 'boq', 'changes', 'team', 'time', 'schedule', 'usage'],
  documents: ['documents'],
  details: ['details', 'closeout', 'warranty'],
};

export function resolveHubFromTabParam(rawTab: string | undefined): {
  hub: ProjectHubKey;
  section: ProjectTabKey;
} {
  const tab = (rawTab ?? 'overview') as ProjectTabKey;
  const mapped = LEGACY_TAB_TO_HUB[tab];
  if (mapped) return mapped;
  return { hub: 'overview', section: 'overview' };
}

/** Which hubs are visible given module/permission flags. */
export function resolveProjectHubs(visibility: ProjectTabVisibility): ProjectHubKey[] {
  const hubs: ProjectHubKey[] = ['overview'];

  const moneySections = HUB_SECTION_PRIORITY.money.filter((section) =>
    isSectionVisible(section, visibility),
  );
  if (moneySections.length > 0) hubs.push('money');

  const workSections = HUB_SECTION_PRIORITY.work.filter((section) =>
    isSectionVisible(section, visibility),
  );
  if (workSections.length > 0) hubs.push('work');

  if (visibility.documents) hubs.push('documents');

  hubs.push('details');

  return PROJECT_HUB_PRIORITY.filter((hub) => hubs.includes(hub));
}

export function visibleHubSections(
  hub: ProjectHubKey,
  visibility: ProjectTabVisibility,
): ProjectTabKey[] {
  return HUB_SECTION_PRIORITY[hub].filter((section) => isSectionVisible(section, visibility));
}

function isSectionVisible(section: ProjectTabKey, visibility: ProjectTabVisibility): boolean {
  switch (section) {
    case 'overview':
    case 'details':
    case 'closeout':
    case 'warranty':
      return true;
    case 'financials':
      return visibility.financials;
    case 'expenses':
      return visibility.expenses;
    case 'changes':
      return visibility.changes;
    case 'boq':
      return visibility.boq;
    case 'billing':
      return visibility.billing;
    case 'billingPlan':
      return visibility.billingPlan;
    case 'budgets':
      return visibility.budgets;
    case 'team':
      return visibility.team;
    case 'schedule':
      return visibility.schedule;
    case 'time':
      return visibility.time;
    case 'documents':
      return visibility.documents;
    case 'usage':
      return visibility.usage;
    case 'work':
      return visibility.work;
    default:
      return false;
  }
}

/** Active hub for tablist highlight from hub or legacy tab. */
export function activeHubFromParams(rawTab: string | undefined): ProjectHubKey {
  return resolveHubFromTabParam(rawTab).hub;
}

/** Default legacy tab when entering a hub from top-level nav. */
export function defaultSectionForHub(hub: ProjectHubKey): ProjectTabKey {
  return HUB_SECTION_PRIORITY[hub][0] ?? 'overview';
}
