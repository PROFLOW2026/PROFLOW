/**
 * Owner vs Card vs All-capabilities dashboard composition (presentation only).
 */

import type { ExperienceFamilyKey } from './experience-family';
import type { WorkMix } from './work-mix';

export const DASHBOARD_LAYOUT_MODES = [
  'owner_full',
  'card_standard',
  'all_capabilities',
] as const;

export type DashboardLayoutMode = (typeof DASHBOARD_LAYOUT_MODES)[number];

export const ALL_CAPABILITIES_CARD_SUPPLEMENTS = [
  'serviceToday',
  'quotePipeline',
  'timeUtilization',
  'firstActions',
] as const;

export type AllCapabilitiesCardSupplement = (typeof ALL_CAPABILITIES_CARD_SUPPLEMENTS)[number];

const OWNER_FIRST_FAMILIES = new Set<ExperienceFamilyKey>([
  'project_contracting',
  'real_estate_development',
  'engineering_consulting_architecture',
  'project_management_supervision',
]);

export interface ResolveDashboardLayoutInput {
  readonly family: ExperienceFamilyKey;
  readonly workMix: WorkMix;
  readonly preferServiceSurface: boolean;
  readonly projectsPrimary: boolean;
}

export function resolveDashboardLayout(input: ResolveDashboardLayoutInput): DashboardLayoutMode {
  if (input.family === 'all_capabilities') {
    return 'all_capabilities';
  }

  const ownerFull =
    !input.preferServiceSurface &&
    (OWNER_FIRST_FAMILIES.has(input.family) ||
      (input.family === 'trades_and_field_work' &&
        (input.workMix === 'projects' || (input.workMix === 'mixed' && input.projectsPrimary))));

  if (ownerFull) return 'owner_full';
  return 'card_standard';
}

export function usesOwnerDashboardLayout(mode: DashboardLayoutMode): boolean {
  return mode === 'owner_full' || mode === 'all_capabilities';
}

/**
 * Card supplements for `all_capabilities` — hides `firstActions` when owner quick actions
 * are visible so "Quick actions" is not duplicated on the dashboard (OD-11 / U02).
 */
export function selectAllCapabilitiesSupplements(
  isVisible: (toggleId: string) => boolean,
): readonly AllCapabilitiesCardSupplement[] {
  const ownerQuickActionsVisible = isVisible('owner.quickActions');
  return ALL_CAPABILITIES_CARD_SUPPLEMENTS.filter((card) => {
    if (!isVisible(`card.${card}`)) return false;
    if (card === 'firstActions' && ownerQuickActionsVisible) return false;
    return true;
  });
}
