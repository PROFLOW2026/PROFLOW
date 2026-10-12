import type { ProjectDetail } from './get-project-detail';
import type { ProjectTabKey } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';

/** Per-tab: true = has data, false = confirmed empty, undefined = unknown (do not hide). */
export type ProjectTabDataPresence = Partial<Record<ProjectTabKey, boolean>>;

export function inferProjectTabDataPresenceFromDetail(detail: ProjectDetail): ProjectTabDataPresence {
  const hasContract = Boolean(detail.contract) || detail.contracts.length > 0;
  const hasWorkPackages = detail.workPackages.length > 0 || detail.showWorkPackages;
  return {
    financials: hasContract ? true : undefined,
    work: hasWorkPackages ? true : undefined,
    billing: hasContract ? true : undefined,
    billingPlan: hasContract ? true : undefined,
  };
}

export function projectTabToggleId(tab: Exclude<ProjectTabKey, 'overview' | 'details'>): `projectTab.${ProjectTabKey}` {
  return `projectTab.${tab}`;
}
