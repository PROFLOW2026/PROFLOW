/**
 * UX persona families — presentation layer over business profile keys.
 * One product; different visible compositions.
 */

import type { BusinessProfileKey } from './business-profiles';

export const EXPERIENCE_PERSONA_KEYS = [
  'project_contractor',
  'electrical',
  'renovation',
  'small_works',
  'service',
  'architecture',
  'consulting',
  'inspection',
  'mixed',
  'all',
] as const;

export type ExperiencePersonaKey = (typeof EXPERIENCE_PERSONA_KEYS)[number];

const PROFILE_TO_PERSONA: Readonly<Partial<Record<BusinessProfileKey, ExperiencePersonaKey>>> = {
  // PLUMBING and HVAC share the service persona family but keep distinct profiles
  // (terminology, modules, today emphasis) — see business-profiles.ts entries.
  GENERAL_CONTRACTOR: 'project_contractor',
  SUBCONTRACTOR: 'project_contractor',
  PROJECT_MANAGEMENT: 'project_contractor',
  ELECTRICAL: 'electrical',
  RENOVATION: 'renovation',
  SMALL_WORKS: 'small_works',
  FIELD_SERVICE: 'service',
  MAINTENANCE: 'service',
  PLUMBING: 'service',
  HVAC: 'service',
  FACILITY_MANAGEMENT: 'service',
  CLEANING: 'service',
  INSTALLATION: 'service',
  LANDSCAPING: 'service',
  ARCHITECT: 'architecture',
  DESIGNER: 'architecture',
  ENGINEERING_CONSULTANT: 'consulting',
  SAFETY_INSPECTION_CONSULTANT: 'inspection',
  MIXED_PROJECT_SERVICE: 'mixed',
  ALL_CAPABILITIES: 'all',
};

export function personaForBusinessProfile(
  profileKey: string | null | undefined,
): ExperiencePersonaKey {
  if (!profileKey) return 'mixed';
  return PROFILE_TO_PERSONA[profileKey as BusinessProfileKey] ?? 'mixed';
}

/** Presentation role buckets on top of existing RBAC (never replace permissions). */
export type ExperienceRoleSurface =
  | 'owner'
  | 'project_manager'
  | 'office'
  | 'finance'
  | 'field'
  | 'general';

export function resolveExperienceRoleSurface(
  roleKeys: readonly string[],
): ExperienceRoleSurface {
  const keys = new Set(roleKeys.map((k) => k.toLowerCase()));
  if (keys.has('owner')) return 'owner';
  if (keys.has('finance') || keys.has('accountant') || keys.has('bookkeeper')) return 'finance';
  if (keys.has('field') || keys.has('field_worker') || keys.has('technician')) return 'field';
  if (keys.has('office') || keys.has('admin_office') || keys.has('coordinator')) return 'office';
  if (keys.has('project_manager') || keys.has('pm') || keys.has('manager')) return 'project_manager';
  return 'general';
}
