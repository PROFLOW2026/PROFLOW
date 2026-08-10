import type { ProjectTabKey } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';

export type JobTabKey = ProjectTabKey;

/**
 * Job workspace tab priority — ops first; hide large-project setup by default.
 *
 * Contract priority: overview → expenses → team → time → billing → docs.
 * Financials stay available when permitted; work/changes stay off unless
 * explicitly revealed after conversion to a project.
 */
export const JOB_TAB_PRIORITY: readonly JobTabKey[] = [
  'overview',
  'expenses',
  'team',
  'time',
  'billing',
  'documents',
  'financials',
  'details',
] as const;

export interface JobTabVisibility {
  readonly expenses: boolean;
  readonly team: boolean;
  readonly time: boolean;
  readonly billing: boolean;
  readonly documents: boolean;
  readonly financials: boolean;
  /** Large-project setup — off for jobs by default. */
  readonly changes?: boolean;
  readonly work?: boolean;
}

/** Filters {@link JOB_TAB_PRIORITY} by module/permission visibility. */
export function resolveJobTabs(visibility: JobTabVisibility): JobTabKey[] {
  return JOB_TAB_PRIORITY.filter((tab) => {
    switch (tab) {
      case 'overview':
      case 'details':
        return true;
      case 'expenses':
        return visibility.expenses;
      case 'team':
        return visibility.team;
      case 'time':
        return visibility.time;
      case 'billing':
        return visibility.billing;
      case 'documents':
        return visibility.documents;
      case 'financials':
        return visibility.financials;
      case 'changes':
        return Boolean(visibility.changes);
      case 'work':
        return Boolean(visibility.work);
      default:
        return false;
    }
  });
}
