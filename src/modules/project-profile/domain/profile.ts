/**
 * Project delivery profile: which hats the organization wears on ONE project.
 *
 * A profile is optional and per project - never an exclusive organization type. An empty
 * role set is a "standard" project. Mirrors `drizzle/schema/dg-project-profile.ts`
 * (kept in sync by unit test; the domain layer must not import the ORM schema).
 */

export const OPERATING_ROLES = [
  'developer',
  'general_contractor',
  'project_management',
  'subcontractor',
] as const;
export type OperatingRole = (typeof OPERATING_ROLES)[number];

export const OWNERSHIP_MODELS = ['client_project', 'own_development', 'joint_venture'] as const;
export type OwnershipModel = (typeof OWNERSHIP_MODELS)[number];

export interface DeliveryProfile {
  readonly operatingRoles: readonly OperatingRole[];
  readonly ownershipModel: OwnershipModel;
  readonly developerEntityName: string | null;
  readonly notes: string | null;
}

export const STANDARD_PROFILE: DeliveryProfile = {
  operatingRoles: [],
  ownershipModel: 'client_project',
  developerEntityName: null,
  notes: null,
};

const ROLE_SET = new Set<string>(OPERATING_ROLES);

export function isOperatingRole(value: unknown): value is OperatingRole {
  return typeof value === 'string' && ROLE_SET.has(value);
}

export function isOwnershipModel(value: unknown): value is OwnershipModel {
  return typeof value === 'string' && (OWNERSHIP_MODELS as readonly string[]).includes(value);
}

/** Deduplicated, catalog-ordered role list; unknown values dropped. */
export function normalizeOperatingRoles(values: Iterable<unknown>): OperatingRole[] {
  const wanted = new Set<string>();
  for (const value of values) if (isOperatingRole(value)) wanted.add(value);
  return OPERATING_ROLES.filter((role) => wanted.has(role));
}

export function isStandardProfile(profile: Pick<DeliveryProfile, 'operatingRoles'>): boolean {
  return profile.operatingRoles.length === 0;
}

export function hasRole(profile: Pick<DeliveryProfile, 'operatingRoles'>, role: OperatingRole): boolean {
  return profile.operatingRoles.includes(role);
}

/**
 * Ownership other than `client_project` requires the developer role. When the developer
 * role is removed the ownership falls back to `client_project` (never an invalid row).
 */
export function resolveOwnershipModel(
  roles: readonly OperatingRole[],
  requested: OwnershipModel | null | undefined,
): OwnershipModel {
  if (!roles.includes('developer')) return 'client_project';
  return requested ?? 'own_development';
}

export type ClientRequirement = 'not_applicable' | 'optional';

/**
 * A developer building for itself has no client: the project must never need a fake one.
 * For every other project the client stays optional (as it always was).
 */
export function clientRequirement(profile: Pick<DeliveryProfile, 'operatingRoles' | 'ownershipModel'>): ClientRequirement {
  if (hasRole(profile, 'developer') && profile.ownershipModel !== 'client_project') {
    return 'not_applicable';
  }
  return 'optional';
}

/** Execution navigation (contractors, coordination, inspections) applies to any non-standard profile. */
export function usesExecutionLayer(profile: Pick<DeliveryProfile, 'operatingRoles'>): boolean {
  return !isStandardProfile(profile);
}

export function buildDeliveryProfile(input: {
  readonly operatingRoles: Iterable<unknown>;
  readonly ownershipModel?: OwnershipModel | null;
  readonly developerEntityName?: string | null;
  readonly notes?: string | null;
}): DeliveryProfile {
  const operatingRoles = normalizeOperatingRoles(input.operatingRoles);
  const ownershipModel = resolveOwnershipModel(operatingRoles, input.ownershipModel);
  const developerEntityName = operatingRoles.includes('developer')
    ? cleanText(input.developerEntityName)
    : null;
  return { operatingRoles, ownershipModel, developerEntityName, notes: cleanText(input.notes) };
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
