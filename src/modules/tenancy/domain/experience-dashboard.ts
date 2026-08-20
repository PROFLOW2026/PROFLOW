/**
 * Dashboard card composition by persona — same financial engines, different chrome.
 */

import type { ExperiencePersonaKey } from './experience-persona';

export type ExperienceDashboardCard =
  | 'attention'
  | 'activeWork'
  | 'contractValue'
  | 'profit'
  | 'forecast'
  | 'commitments'
  | 'billing'
  | 'collections'
  | 'serviceToday'
  | 'timeUtilization'
  | 'quotePipeline'
  | 'firstActions';

export const PERSONA_DASHBOARD_CARDS: Readonly<
  Record<ExperiencePersonaKey, readonly ExperienceDashboardCard[]>
> = {
  project_contractor: [
    'attention',
    'activeWork',
    'contractValue',
    'profit',
    'forecast',
    'commitments',
    'billing',
    'collections',
  ],
  electrical: [
    'attention',
    'activeWork',
    'quotePipeline',
    'billing',
    'collections',
    'commitments',
    'profit',
  ],
  renovation: [
    'attention',
    'activeWork',
    'quotePipeline',
    'profit',
    'billing',
    'collections',
    'commitments',
  ],
  small_works: ['attention', 'activeWork', 'firstActions', 'billing', 'collections'],
  service: [
    'attention',
    'serviceToday',
    'activeWork',
    'firstActions',
    'billing',
    'collections',
  ],
  architecture: [
    'attention',
    'activeWork',
    'timeUtilization',
    'billing',
    'collections',
    'profit',
  ],
  consulting: [
    'attention',
    'activeWork',
    'timeUtilization',
    'billing',
    'collections',
    'profit',
  ],
  inspection: ['attention', 'activeWork', 'serviceToday', 'billing', 'collections'],
  mixed: [
    'attention',
    'activeWork',
    'contractValue',
    'billing',
    'collections',
    'profit',
    'serviceToday',
  ],
  all: [
    'attention',
    'activeWork',
    'contractValue',
    'profit',
    'forecast',
    'commitments',
    'billing',
    'collections',
    'serviceToday',
    'timeUtilization',
    'quotePipeline',
  ],
};

export function dashboardCardsForPersona(
  persona: ExperiencePersonaKey,
): readonly ExperienceDashboardCard[] {
  return PERSONA_DASHBOARD_CARDS[persona];
}
