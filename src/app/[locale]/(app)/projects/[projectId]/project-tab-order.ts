import type { ProjectExperienceProfileKey } from '@/modules/tenancy/domain/project-profiles';
import { projectProfileAllowsTab } from '@/modules/tenancy/domain/project-profiles';

export type ProjectTabKey =
  | 'overview'
  | 'financials'
  | 'expenses'
  | 'changes'
  | 'boq'
  | 'billing'
  | 'budgets'
  | 'work'
  | 'team'
  | 'schedule'
  | 'time'
  | 'documents'
  | 'usage'
  | 'closeout'
  | 'warranty'
  | 'details';

/**
 * Business-priority order for project workspace tabs.
 *
 * Array order is encounter order at the reading-start edge (right in RTL,
 * left in LTR). Do not reverse this for Hebrew - CSS `dir` handles mirroring.
 */
export const PROJECT_TAB_PRIORITY: readonly ProjectTabKey[] = [
  'overview',
  'financials',
  'budgets',
  'boq',
  'changes',
  'billing',
  'expenses',
  'usage',
  'team',
  'time',
  'schedule',
  'work',
  'documents',
  'closeout',
  'warranty',
  'details',
] as const;

export interface ProjectTabVisibility {
  readonly financials: boolean;
  readonly expenses: boolean;
  readonly changes: boolean;
  readonly boq: boolean;
  readonly billing: boolean;
  readonly budgets: boolean;
  readonly team: boolean;
  readonly schedule: boolean;
  readonly time: boolean;
  readonly documents: boolean;
  readonly usage: boolean;
  readonly work: boolean;
  readonly closeout: boolean;
  readonly warranty: boolean;
}

/** Filters {@link PROJECT_TAB_PRIORITY} by module/permission visibility. */
export function resolveProjectTabs(visibility: ProjectTabVisibility): ProjectTabKey[] {
  return PROJECT_TAB_PRIORITY.filter((tab) => {
    switch (tab) {
      case 'overview':
      case 'details':
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
      case 'closeout':
        return visibility.closeout;
      case 'warranty':
        return visibility.warranty;
      default:
        return false;
    }
  });
}

/** AND org module/permission flags with the project experience profile allowlist. */
export function applyProjectProfileToTabVisibility(
  visibility: ProjectTabVisibility,
  profile: ProjectExperienceProfileKey,
): ProjectTabVisibility {
  return {
    financials: visibility.financials && projectProfileAllowsTab(profile, 'financials'),
    expenses: visibility.expenses && projectProfileAllowsTab(profile, 'expenses'),
    changes: visibility.changes && projectProfileAllowsTab(profile, 'changes'),
    boq: visibility.boq && projectProfileAllowsTab(profile, 'boq'),
    billing: visibility.billing && projectProfileAllowsTab(profile, 'billing'),
    budgets: visibility.budgets && projectProfileAllowsTab(profile, 'budgets'),
    team: visibility.team && projectProfileAllowsTab(profile, 'team'),
    schedule: visibility.schedule && projectProfileAllowsTab(profile, 'schedule'),
    time: visibility.time && projectProfileAllowsTab(profile, 'time'),
    documents: visibility.documents && projectProfileAllowsTab(profile, 'documents'),
    usage: visibility.usage && projectProfileAllowsTab(profile, 'usage'),
    work: visibility.work && projectProfileAllowsTab(profile, 'work'),
    closeout: visibility.closeout && projectProfileAllowsTab(profile, 'closeout'),
    warranty: visibility.warranty && projectProfileAllowsTab(profile, 'warranty'),
  };
}
