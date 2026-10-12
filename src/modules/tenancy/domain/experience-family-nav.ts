/**
 * Primary nav emphasis by experience family (destinations unchanged).
 */

import type { ExperienceFamilyKey } from './experience-family';

export const FAMILY_PRIMARY_NAV_KEYS: Readonly<
  Record<ExperienceFamilyKey, readonly string[]>
> = {
  engineering_consulting_architecture: ['today', 'dashboard', 'projects', 'portfolio', 'clients'],
  real_estate_development: ['dashboard', 'projects', 'clients', 'expenses', 'cashFlow'],
  project_contracting: ['dashboard', 'projects', 'expenses', 'clients'],
  trades_and_field_work: ['today', 'dashboard', 'jobs', 'projects', 'expenses'],
  project_management_supervision: ['today', 'dashboard', 'projects', 'portfolio', 'myWork'],
  service_and_maintenance: ['today', 'dashboard', 'workOrders', 'fieldHome', 'clients'],
  all_capabilities: ['today', 'dashboard', 'projects', 'jobs', 'expenses'],
  custom: ['today', 'dashboard', 'projects', 'jobs', 'expenses'],
};

export function primaryNavKeysForExperience(
  family: ExperienceFamilyKey | null,
  personaPrimary: readonly string[],
): readonly string[] {
  if (!family) return personaPrimary;
  return FAMILY_PRIMARY_NAV_KEYS[family] ?? personaPrimary;
}
