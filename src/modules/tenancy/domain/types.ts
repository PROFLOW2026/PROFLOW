/**
 * Tenancy domain types. Framework-free: no React, no Next.js, no persistence.
 */

export type CostFamily = 'direct_project' | 'shared' | 'business_overhead' | 'asset_capital';

export type MembershipStatus = 'active' | 'invited' | 'suspended';

export interface OrganizationDraft {
  readonly name: string;
  readonly countryCode: string;
  readonly baseCurrency: string;
  readonly timezone: string;
  readonly defaultLocale: string;
}

/**
 * Modules whose navigation prominence adapts to usage (doc 41 §7).
 *
 * Projects and Expenses are always present, so they are not listed: there is
 * no way to hide the core loop.
 */
export const OPTIONAL_MODULE_KEYS = [
  'billing',
  'workforce',
  'vendors',
  'clients',
  'documents',
  'changes',
  'overhead',
  'crm',
  'compliance',
  'portal',
  'api',
  'procurement',
  'materials',
  'field_ops',
  'assets',
  /** Short / daily work UX; shares `projects` rows + PROJECTS_* permissions. */
  'jobs',
] as const;

export type OptionalModuleKey = (typeof OPTIONAL_MODULE_KEYS)[number];

export function isOptionalModuleKey(value: string): value is OptionalModuleKey {
  return (OPTIONAL_MODULE_KEYS as readonly string[]).includes(value);
}

/** Which optional modules appear in navigation for this organization. */
export type ModuleVisibility = Record<OptionalModuleKey, boolean>;

/**
 * Map features-panel form tokens (`on` / `off` / `auto`) and boolean strings
 * to the nullable preference stored for module visibility.
 */
export function parseModuleVisibilityMode(value: string | null | undefined): boolean | null {
  if (value === 'auto') return null;
  if (value === 'true' || value === 'on') return true;
  if (value === 'false' || value === 'off') return false;
  return null;
}

/**
 * Pure visibility resolution (doc 41 §2, option C).
 * Explicit owner choice wins; otherwise first real usage decides.
 */
export function resolveModuleVisibility(
  preferences: readonly { moduleKey: string; enabled: boolean | null; firstUsedAt: Date | null }[],
): ModuleVisibility {
  const byKey = new Map(preferences.map((preference) => [preference.moduleKey, preference]));

  return Object.fromEntries(
    OPTIONAL_MODULE_KEYS.map((key) => {
      const preference = byKey.get(key);
      if (preference?.enabled !== null && preference?.enabled !== undefined) {
        return [key, preference.enabled];
      }
      return [key, preference?.firstUsedAt != null];
    }),
  ) as ModuleVisibility;
}
