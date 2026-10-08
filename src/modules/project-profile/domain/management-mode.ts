import type { DeliveryProfile, OperatingRole } from './profile';

/**
 * Exclusive project-management mode. Derived from `operating_roles`.
 * A subcontract agreement never selects this mode.
 */
export const MANAGEMENT_MODES = [
  'standard_project',
  'execution_contractor',
  'developer_gc',
  'project_management',
] as const;

export type ManagementMode = (typeof MANAGEMENT_MODES)[number];

export function isManagementMode(value: unknown): value is ManagementMode {
  return typeof value === 'string' && (MANAGEMENT_MODES as readonly string[]).includes(value);
}

/** Exact role-set match. Any other mix, including a single developer or GC role, stays standard. */
export function resolveManagementMode(
  profile: Pick<DeliveryProfile, 'operatingRoles'> | null | undefined,
): ManagementMode {
  if (!profile) return 'standard_project';
  const roles = new Set(profile.operatingRoles);
  if (roles.size === 2 && roles.has('developer') && roles.has('general_contractor')) return 'developer_gc';
  if (roles.size === 1 && roles.has('subcontractor')) return 'execution_contractor';
  if (roles.size === 1 && roles.has('project_management')) return 'project_management';
  return 'standard_project';
}

export function isDeveloperGcMode(
  profile: Pick<DeliveryProfile, 'operatingRoles'> | null | undefined,
): boolean {
  return resolveManagementMode(profile) === 'developer_gc';
}

export function operatingRolesForMode(mode: ManagementMode): OperatingRole[] {
  switch (mode) {
    case 'developer_gc':
      return ['developer', 'general_contractor'];
    case 'execution_contractor':
      return ['subcontractor'];
    case 'project_management':
      return ['project_management'];
    default:
      return [];
  }
}
