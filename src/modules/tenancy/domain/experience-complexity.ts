/**
 * Experience complexity: how much of the profile’s ProjectFlow to show.
 * Orthogonal to business profile and to “All Capabilities”.
 */

import type { OptionalModuleKey, ModuleVisibility } from './types';
import type { ExperiencePersonaKey } from './experience-persona';

export const EXPERIENCE_COMPLEXITY_KEYS = ['simple', 'advanced', 'full'] as const;
export type ExperienceComplexityKey = (typeof EXPERIENCE_COMPLEXITY_KEYS)[number];

export const EXPERIENCE_COMPLEXITY_SETTING_KEY = 'experience_complexity';

export function isExperienceComplexityKey(
  value: string | null | undefined,
): value is ExperienceComplexityKey {
  return (
    typeof value === 'string' &&
    (EXPERIENCE_COMPLEXITY_KEYS as readonly string[]).includes(value)
  );
}

export function parseExperienceComplexity(
  value: unknown,
): ExperienceComplexityKey | null {
  if (typeof value !== 'string') return null;
  return isExperienceComplexityKey(value) ? value : null;
}

/** Core modules always kept when complexity is simple (if profile recommends them). */
const SIMPLE_CORE: readonly OptionalModuleKey[] = [
  'clients',
  'quotes',
  'billing',
  'documents',
  'workforce',
  'jobs',
  'command_center',
];

const ADVANCED_EXTRA: readonly OptionalModuleKey[] = [
  'vendors',
  'procurement',
  'changes',
  'budgets',
  'field_ops',
  'forms',
  'service',
  'materials',
  'approvals',
];

/**
 * Filter a recommended module list by complexity.
 * `full` = unchanged recommendation. `all` persona ignores complexity.
 */
export function filterModulesByComplexity(
  recommended: readonly OptionalModuleKey[],
  complexity: ExperienceComplexityKey,
  persona: ExperiencePersonaKey,
): readonly OptionalModuleKey[] {
  if (persona === 'all' || complexity === 'full') return recommended;

  const recommendedSet = new Set(recommended);
  const allow = new Set<OptionalModuleKey>();

  for (const key of SIMPLE_CORE) {
    if (recommendedSet.has(key)) allow.add(key);
  }

  // Persona-specific simple additions
  if (persona === 'service' && recommendedSet.has('service')) allow.add('service');
  if (persona === 'inspection' && recommendedSet.has('safety')) allow.add('safety');
  if (persona === 'inspection' && recommendedSet.has('field_ops')) allow.add('field_ops');
  if (
    (persona === 'project_contractor' || persona === 'electrical' || persona === 'renovation') &&
    recommendedSet.has('field_ops')
  ) {
    allow.add('field_ops');
  }

  if (complexity === 'simple') {
    return recommended.filter((key) => allow.has(key));
  }

  // advanced
  for (const key of ADVANCED_EXTRA) {
    if (recommendedSet.has(key)) allow.add(key);
  }
  if (persona === 'project_contractor' && recommendedSet.has('boq')) {
    // BOQ stays full-only for contractors unless advanced+explicit — keep off in advanced
  }
  return recommended.filter((key) => allow.has(key) || ADVANCED_EXTRA.includes(key));
}

/**
 * Apply complexity as a visibility overlay on already-resolved org modules.
 * Never turns on modules the org has explicitly disabled.
 * Never enables portal.
 */
/**
 * Shell destinations that stay visible when experience depth is Simple.
 * Permission-only chrome (imports, month close, vendor bills, etc.) is hidden.
 */
export const SIMPLE_SHELL_NAV_KEYS = new Set([
  'dashboard',
  'today',
  'projects',
  'jobs',
  'expenses',
  'clients',
  'quotes',
  'contracts',
  'crm',
  'billing',
  'documents',
  'workforce',
  'time',
  'changes',
  'vendors',
  'procurement',
  'procurementRfqs',
  'subcontracts',
  'materials',
  'fieldOps',
  'fieldHome',
  'workOrders',
  'dispatch',
  'serviceRecurring',
  'forms',
  'safety',
  'reports',
  'settings',
]);

/** Nav keys gated by permission only (no optional module toggle). */
export const PERMISSION_ONLY_NAV_KEYS = new Set([
  'recurringDrafts',
  'vendorBills',
  'imports',
  'monthClose',
  'overhead',
  'cashFlow',
  'scheduling',
  'calendar',
  'approvals',
  'compliance',
  'assets',
  'warranty',
  'communications',
  'assistant',
  'automations',
]);

/**
 * When complexity is simple, hide permission-only overflow unless explicitly allowlisted.
 * Full/advanced leave the catalog unchanged.
 */
export function filterNavKeysByComplexity(
  navKeys: readonly string[],
  complexity: ExperienceComplexityKey,
): readonly string[] {
  if (complexity !== 'simple') return navKeys;
  return navKeys.filter((key) => {
    if (SIMPLE_SHELL_NAV_KEYS.has(key)) return true;
    if (PERMISSION_ONLY_NAV_KEYS.has(key)) return false;
    return true;
  });
}

export function applyComplexityToVisibility(
  modules: ModuleVisibility | Record<string, boolean>,
  recommended: readonly OptionalModuleKey[],
  complexity: ExperienceComplexityKey,
  persona: ExperiencePersonaKey,
  customizationMode: 'profile' | 'custom' | 'all' | null,
): ModuleVisibility {
  // Custom / all orgs keep explicit toggles — complexity only hints for new setups
  if (customizationMode === 'custom' || customizationMode === 'all' || persona === 'all') {
    return { ...(modules as ModuleVisibility) };
  }

  const allowed = new Set(
    filterModulesByComplexity(recommended, complexity, persona),
  );
  const next = { ...(modules as ModuleVisibility) };
  for (const key of Object.keys(next) as OptionalModuleKey[]) {
    if (key === 'portal') {
      next[key] = false;
      continue;
    }
    if (key === 'command_center') {
      next[key] = true;
      continue;
    }
    // Only constrain modules that are part of the profile recommendation story
    if (recommended.includes(key) || allowed.has(key)) {
      if (!allowed.has(key) && complexity !== 'full') {
        // Hide from nav if not in complexity band — do not write prefs
        next[key] = false;
      }
    }
  }
  return next;
}
