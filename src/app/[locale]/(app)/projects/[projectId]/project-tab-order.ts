export type ProjectTabKey =
  | 'overview'
  | 'financials'
  | 'expenses'
  | 'changes'
  | 'billing'
  | 'work'
  | 'team'
  | 'time'
  | 'documents'
  | 'details';

/**
 * Business-priority order for project workspace tabs.
 *
 * Array order is encounter order at the reading-start edge (right in RTL,
 * left in LTR). Do not reverse this for Hebrew — CSS `dir` handles mirroring.
 */
export const PROJECT_TAB_PRIORITY: readonly ProjectTabKey[] = [
  'overview',
  'financials',
  'expenses',
  'team',
  'changes',
  'billing',
  'time',
  'documents',
  'work',
  'details',
] as const;

export interface ProjectTabVisibility {
  readonly financials: boolean;
  readonly expenses: boolean;
  readonly changes: boolean;
  readonly billing: boolean;
  readonly team: boolean;
  readonly time: boolean;
  readonly documents: boolean;
  readonly work: boolean;
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
      case 'billing':
        return visibility.billing;
      case 'team':
        return visibility.team;
      case 'time':
        return visibility.time;
      case 'documents':
        return visibility.documents;
      case 'work':
        return visibility.work;
      default:
        return false;
    }
  });
}
