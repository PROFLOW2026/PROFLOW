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
] as const;

export type OptionalModuleKey = (typeof OPTIONAL_MODULE_KEYS)[number];

export function isOptionalModuleKey(value: string): value is OptionalModuleKey {
  return (OPTIONAL_MODULE_KEYS as readonly string[]).includes(value);
}
