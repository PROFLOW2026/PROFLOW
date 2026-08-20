/**
 * Curated Dynamic Experience onboarding — short questions, not a long survey.
 * Maps user-facing answers onto business profiles, work mix, and additive modules.
 */

import type { BusinessProfileKey } from './business-profiles';
import type { OptionalModuleKey } from './types';
import type { WorkMix } from './work-mix';

/** Curated business-type choices shown in onboarding (maps to profiles). */
export const ONBOARDING_BUSINESS_TYPES = [
  'GENERAL_CONTRACTOR',
  'ELECTRICAL',
  'PLUMBING',
  'HVAC',
  'RENOVATION',
  'SMALL_WORKS',
  'FIELD_SERVICE',
  'ARCHITECT',
  'DESIGNER',
  'ENGINEERING_CONSULTANT',
  'SAFETY_INSPECTION_CONSULTANT',
  'MIXED_PROJECT_SERVICE',
] as const satisfies readonly BusinessProfileKey[];

export type OnboardingBusinessType = (typeof ONBOARDING_BUSINESS_TYPES)[number];

export function isOnboardingBusinessType(value: unknown): value is OnboardingBusinessType {
  return (
    typeof value === 'string' &&
    (ONBOARDING_BUSINESS_TYPES as readonly string[]).includes(value)
  );
}

/**
 * How the business mainly works — UI options; stored as WorkMix after mapping.
 * `service` / `consulting` collapse onto existing work-mix chrome.
 */
export const ONBOARDING_WORK_STYLES = [
  'projects',
  'jobs',
  'service',
  'consulting',
  'mixed',
] as const;

export type OnboardingWorkStyle = (typeof ONBOARDING_WORK_STYLES)[number];

export function isOnboardingWorkStyle(value: unknown): value is OnboardingWorkStyle {
  return (
    typeof value === 'string' &&
    (ONBOARDING_WORK_STYLES as readonly string[]).includes(value)
  );
}

export function workMixForOnboardingStyle(style: OnboardingWorkStyle): WorkMix {
  switch (style) {
    case 'jobs':
    case 'service':
      return 'jobs';
    case 'mixed':
      return 'mixed';
    case 'projects':
    case 'consulting':
    default:
      return 'projects';
  }
}

/** Multi-select “what you manage” — additive enables on top of the profile. */
export const ONBOARDING_MANAGE_OPTIONS = [
  'employees',
  'suppliers',
  'subcontractors',
  'boq',
  'inventory',
  'field',
] as const;

export type OnboardingManageOption = (typeof ONBOARDING_MANAGE_OPTIONS)[number];

export function isOnboardingManageOption(value: unknown): value is OnboardingManageOption {
  return (
    typeof value === 'string' &&
    (ONBOARDING_MANAGE_OPTIONS as readonly string[]).includes(value)
  );
}

const MANAGE_OPTION_MODULES: Record<OnboardingManageOption, readonly OptionalModuleKey[]> = {
  employees: ['workforce'],
  suppliers: ['vendors'],
  subcontractors: ['vendors', 'procurement'],
  boq: ['boq'],
  inventory: ['materials'],
  field: ['field_ops'],
};

export function modulesForManageOptions(
  options: readonly OnboardingManageOption[],
): readonly OptionalModuleKey[] {
  const out = new Set<OptionalModuleKey>();
  for (const option of options) {
    for (const key of MANAGE_OPTION_MODULES[option]) {
      out.add(key);
    }
  }
  return [...out];
}

export const ONBOARDING_PATHS = ['recommended', 'all', 'none'] as const;
export type OnboardingPath = (typeof ONBOARDING_PATHS)[number];

export function isOnboardingPath(value: unknown): value is OnboardingPath {
  return typeof value === 'string' && (ONBOARDING_PATHS as readonly string[]).includes(value);
}

export function resolveOnboardingProfileKey(input: {
  path: OnboardingPath;
  businessType: OnboardingBusinessType | null;
}): BusinessProfileKey | null {
  if (input.path === 'none') return null;
  if (input.path === 'all') return 'ALL_CAPABILITIES';
  return input.businessType;
}
