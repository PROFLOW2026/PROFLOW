import type { CostFamily } from './types';

/**
 * Defaults applied when an organization is created (doc 39 §10: presets, not
 * restrictions).
 *
 * These exist so the optional cost-family fields have something sensible to
 * offer the first time a user opens them. Nothing here obliges the organization
 * to categorise anything, and every entry can be renamed or archived.
 */

export interface CostCategoryPreset {
  readonly key: string;
  /** English canonical name; the UI prefers the `costCategories.<key>` message. */
  readonly name: string;
  readonly family: CostFamily;
  readonly sortOrder: number;
}

/**
 * Canonical transaction taxonomy shared by Expense + AP.
 * Legacy `labor` is NOT offered for new orgs (historical rows may still exist).
 * Internal employee payroll is Workforce — not seeded here.
 */
export const DEFAULT_COST_CATEGORIES: readonly CostCategoryPreset[] = [
  { key: 'materials', name: 'Materials', family: 'direct_project', sortOrder: 10 },
  { key: 'subcontractor', name: 'Subcontractor', family: 'direct_project', sortOrder: 20 },
  { key: 'external_manpower', name: 'External manpower', family: 'direct_project', sortOrder: 25 },
  { key: 'external_service', name: 'External professional service', family: 'direct_project', sortOrder: 28 },
  { key: 'equipment_rental', name: 'Equipment rental', family: 'direct_project', sortOrder: 40 },
  { key: 'permits_fees', name: 'Permits and fees', family: 'direct_project', sortOrder: 50 },
  { key: 'project_travel', name: 'Project travel / logistics', family: 'direct_project', sortOrder: 60 },
  { key: 'other_direct', name: 'Other direct cost', family: 'direct_project', sortOrder: 70 },

  { key: 'shared_supervision', name: 'Shared supervision', family: 'shared', sortOrder: 110 },
  { key: 'shared_equipment', name: 'Shared equipment', family: 'shared', sortOrder: 120 },
  { key: 'shared_logistics', name: 'Shared logistics', family: 'shared', sortOrder: 130 },

  { key: 'rent', name: 'Rent', family: 'business_overhead', sortOrder: 210 },
  { key: 'utilities', name: 'Utilities', family: 'business_overhead', sortOrder: 220 },
  { key: 'accounting_legal', name: 'Accounting and legal', family: 'business_overhead', sortOrder: 230 },
  { key: 'insurance', name: 'Insurance', family: 'business_overhead', sortOrder: 240 },
  { key: 'marketing', name: 'Marketing', family: 'business_overhead', sortOrder: 250 },
  { key: 'software', name: 'Software and subscriptions', family: 'business_overhead', sortOrder: 260 },
  { key: 'bank_fees', name: 'Bank and finance fees', family: 'business_overhead', sortOrder: 270 },
  { key: 'office_supplies', name: 'Office supplies', family: 'business_overhead', sortOrder: 280 },
  { key: 'vehicle_fuel', name: 'Vehicle and fuel', family: 'business_overhead', sortOrder: 290 },
  { key: 'other_overhead', name: 'Other overhead', family: 'business_overhead', sortOrder: 300 },

  { key: 'equipment_purchase', name: 'Equipment purchase', family: 'asset_capital', sortOrder: 410 },
  { key: 'vehicle_purchase', name: 'Vehicle purchase', family: 'asset_capital', sortOrder: 420 },
  { key: 'tools', name: 'Tools', family: 'asset_capital', sortOrder: 430 },
];

/** Currency and time zone defaults inferred from the chosen country. */
export const COUNTRY_DEFAULTS: Readonly<
  Record<string, { currency: string; timezone: string; locale: string }>
> = {
  IL: { currency: 'ILS', timezone: 'Asia/Jerusalem', locale: 'he-IL' },
  US: { currency: 'USD', timezone: 'America/New_York', locale: 'en' },
  GB: { currency: 'GBP', timezone: 'Europe/London', locale: 'en' },
};

export function defaultsForCountry(countryCode: string) {
  return COUNTRY_DEFAULTS[countryCode.toUpperCase()] ?? COUNTRY_DEFAULTS.IL!;
}
