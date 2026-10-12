/**
 * Experience families — UX buckets over business profiles (presentation only).
 */

import type { BusinessProfileKey } from './business-profiles';
import type { CapabilityCustomizationMode } from './capability-overrides';
import type { WorkMix } from './work-mix';

export const EXPERIENCE_FAMILY_KEYS = [
  'engineering_consulting_architecture',
  'real_estate_development',
  'project_contracting',
  'trades_and_field_work',
  'project_management_supervision',
  'service_and_maintenance',
  'all_capabilities',
  'custom',
] as const;

export type ExperienceFamilyKey = (typeof EXPERIENCE_FAMILY_KEYS)[number];

export const EXPERIENCE_FAMILY_SETTING_KEY = 'experience_family';
export const EXPERIENCE_UI_OVERRIDES_SETTING_KEY = 'experience_ui_overrides';
export const EXPERIENCE_BASE_TEMPLATE_SETTING_KEY = 'experience_base_template';
export const EXPERIENCE_PROJECTS_PRIMARY_SETTING_KEY = 'experience_projects_primary';

const TRADE_PROFILES = new Set<BusinessProfileKey>([
  'ELECTRICAL',
  'PLUMBING',
  'HVAC',
  'INSTALLATION',
]);

export function isExperienceFamilyKey(value: unknown): value is ExperienceFamilyKey {
  return typeof value === 'string' && (EXPERIENCE_FAMILY_KEYS as readonly string[]).includes(value);
}

export function parseExperienceFamilyKey(value: unknown): ExperienceFamilyKey | null {
  return isExperienceFamilyKey(value) ? value : null;
}

export function familyForBusinessProfile(profileKey: BusinessProfileKey): ExperienceFamilyKey {
  switch (profileKey) {
    case 'ARCHITECT':
    case 'DESIGNER':
    case 'ENGINEERING_CONSULTANT':
      return 'engineering_consulting_architecture';
    case 'REAL_ESTATE_DEVELOPMENT':
      return 'real_estate_development';
    case 'GENERAL_CONTRACTOR':
    case 'RENOVATION':
    case 'SUBCONTRACTOR':
      return 'project_contracting';
    case 'SMALL_WORKS':
      return 'trades_and_field_work';
    case 'PROJECT_MANAGEMENT':
    case 'SAFETY_INSPECTION_CONSULTANT':
      return 'project_management_supervision';
    case 'FIELD_SERVICE':
    case 'MAINTENANCE':
    case 'FACILITY_MANAGEMENT':
    case 'CLEANING':
    case 'LANDSCAPING':
      return 'service_and_maintenance';
    case 'ALL_CAPABILITIES':
      return 'all_capabilities';
    case 'MIXED_PROJECT_SERVICE':
      return 'custom';
    default:
      if (TRADE_PROFILES.has(profileKey)) return 'trades_and_field_work';
      return 'project_contracting';
  }
}

export interface ResolveExperienceFamilyInput {
  readonly businessProfileKey: BusinessProfileKey | null;
  readonly workMix: WorkMix;
  readonly preferServiceSurface: boolean;
  readonly customizationMode: CapabilityCustomizationMode | null;
  readonly storedFamily: ExperienceFamilyKey | null;
  readonly projectsPrimary: boolean;
}

/** Stored org family wins; else derive from profile + work pattern. */
export function resolveExperienceFamily(input: ResolveExperienceFamilyInput): ExperienceFamilyKey {
  if (input.customizationMode === 'all' || input.businessProfileKey === 'ALL_CAPABILITIES') {
    return 'all_capabilities';
  }
  if (input.customizationMode === 'custom') {
    return input.storedFamily ?? familyForBusinessProfile(input.businessProfileKey ?? 'MIXED_PROJECT_SERVICE');
  }
  if (input.storedFamily) return input.storedFamily;

  const base = familyForBusinessProfile(input.businessProfileKey ?? 'MIXED_PROJECT_SERVICE');

  if (TRADE_PROFILES.has(input.businessProfileKey as BusinessProfileKey)) {
    if (input.workMix === 'projects' || (input.workMix === 'mixed' && input.projectsPrimary)) {
      return 'project_contracting';
    }
    return 'trades_and_field_work';
  }

  if (input.businessProfileKey === 'MIXED_PROJECT_SERVICE') {
    if (input.preferServiceSurface && input.workMix !== 'projects') {
      return 'service_and_maintenance';
    }
    if (input.workMix === 'mixed') return 'custom';
  }

  return base;
}

export const EXPERIENCE_FAMILY_REPRESENTATIVE_PROFILE: Readonly<
  Record<ExperienceFamilyKey, BusinessProfileKey>
> = {
  engineering_consulting_architecture: 'ENGINEERING_CONSULTANT',
  real_estate_development: 'REAL_ESTATE_DEVELOPMENT',
  project_contracting: 'GENERAL_CONTRACTOR',
  trades_and_field_work: 'ELECTRICAL',
  project_management_supervision: 'PROJECT_MANAGEMENT',
  service_and_maintenance: 'FIELD_SERVICE',
  all_capabilities: 'ALL_CAPABILITIES',
  custom: 'MIXED_PROJECT_SERVICE',
};

export type ExperienceUiOverrides = Readonly<Partial<Record<string, boolean>>>;

export function parseExperienceUiOverrides(value: unknown): ExperienceUiOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'boolean') out[key] = entry;
  }
  return out;
}
