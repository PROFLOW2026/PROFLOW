/**
 * Org profile type domain constants.
 * Separate from the business-profiles.ts (legacy) system — this is the new
 * Universal Work Management org identity for stage seeding & templates.
 */

export const ORG_PROFILE_TYPE_SETTING_KEY = 'org_profile_type' as const;
export const TERMINOLOGY_OVERRIDE_SETTING_KEY = 'uwm_terminology_overrides' as const;

export const ORG_PROFILE_TYPES = [
  'architect',
  'engineer',
  'consultant',
  'project_manager',
  'developer',
  'contractor',
  'subcontractor',
  'supervisor',
  'other',
] as const;

export type OrgProfileType = (typeof ORG_PROFILE_TYPES)[number];

export function isOrgProfileType(value: unknown): value is OrgProfileType {
  return typeof value === 'string' && (ORG_PROFILE_TYPES as readonly string[]).includes(value);
}

export const ORG_PROFILE_TYPE_LABELS: Record<OrgProfileType, { label: string; description: string }> = {
  architect: {
    label: 'Architect',
    description: 'Architectural design, planning, and permit management',
  },
  engineer: {
    label: 'Engineer',
    description: 'Structural, civil, MEP, or specialty engineering',
  },
  consultant: {
    label: 'Consultant',
    description: 'Professional consultancy and advisory services',
  },
  project_manager: {
    label: 'Project Manager',
    description: 'Independent project management and oversight',
  },
  developer: {
    label: 'Developer / Real Estate',
    description: 'Real estate development, land, and property projects',
  },
  contractor: {
    label: 'General Contractor',
    description: 'Construction, renovation, and build contracting',
  },
  subcontractor: {
    label: 'Subcontractor',
    description: 'Specialty trade or subcontract work under a GC',
  },
  supervisor: {
    label: 'Supervisor / Inspector',
    description: 'Site supervision, quality inspection, and compliance',
  },
  other: {
    label: 'Other',
    description: 'Other construction industry professional',
  },
};

export interface TerminologyOverrides {
  project?: string | null;
  task?: string | null;
  board?: string | null;
  stage?: string | null;
  bucket?: string | null;
}

export const DEFAULT_TERMINOLOGY: Record<keyof TerminologyOverrides, string> = {
  project: 'Project',
  task: 'Task',
  board: 'Board',
  stage: 'Stage',
  bucket: 'Bucket',
};
