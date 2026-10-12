import type { ProjectTabKey, ProjectTabVisibility } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';
import type { ProjectTabDataPresence } from '@/modules/projects/application/project-tab-data-presence';
import { projectTabToggleId } from '@/modules/projects/application/project-tab-data-presence';
import {
  isExperienceUiVisible,
  type ExperienceUiContext,
} from './experience-ui-registry';

const OPTIONAL_TABS: readonly Exclude<ProjectTabKey, 'overview' | 'details'>[] = [
  'financials',
  'expenses',
  'changes',
  'boq',
  'billing',
  'billingPlan',
  'budgets',
  'team',
  'schedule',
  'time',
  'documents',
  'usage',
  'work',
  'closeout',
  'warranty',
];

export function applyExperienceUiToProjectTabVisibility(
  visibility: ProjectTabVisibility,
  ctx: ExperienceUiContext,
  presence: ProjectTabDataPresence,
): ProjectTabVisibility {
  if (ctx.customizationMode !== 'custom') return visibility;

  const next = { ...visibility };
  for (const tab of OPTIONAL_TABS) {
    if (!visibility[tab]) continue;
    const toggleId = projectTabToggleId(tab);
    const dataFlag = presence[tab];
    const visible = isExperienceUiVisible(toggleId, ctx, {
      dataPresent: dataFlag === true ? true : dataFlag === false ? false : undefined,
    });
    if (!visible && dataFlag !== true) {
      next[tab] = false;
    }
  }
  return next;
}
