/**
 * Soft suggestions to hide enabled-but-unused customer capabilities.
 * Never auto-hides — UI must confirm. Dismissals live in organization_settings.
 */

import {
  CUSTOMER_FEATURE_MODULE_KEYS,
  type OptionalModuleKey,
} from './types';

export const UNUSED_CAPABILITY_DISMISSALS_SETTING_KEY = 'unused_capability_dismissals';

/** Always excluded from unused suggestions (foundational / always-relevant). */
export const UNUSED_CAPABILITY_NEVER_SUGGEST = [
  'billing',
  'clients',
  'workforce',
  'command_center',
] as const satisfies readonly OptionalModuleKey[];

const NEVER_SUGGEST = new Set<string>(UNUSED_CAPABILITY_NEVER_SUGGEST);

/**
 * Prefer surfacing these when unused — owners often miss BOQ, month-close,
 * retention (via billing), recurring drafts (via overhead/expenses), multi-contract.
 */
export const UNUSED_CAPABILITY_PRIORITY = [
  'boq',
  'month_close',
  'budgets',
  'quotes',
  'procurement',
  'changes',
] as const satisfies readonly OptionalModuleKey[];

/**
 * Discoverability tip keys that are not toggleable modules but should be
 * mentioned alongside unused-capability suggestions (copy / education only).
 */
export const DISCOVERABILITY_TIP_KEYS = [
  'boq',
  'retention',
  'month_close',
  'recurring_drafts',
  'multi_contract',
] as const;
export type DiscoverabilityTipKey = (typeof DISCOVERABILITY_TIP_KEYS)[number];

/** Days without use before an enabled module is suggested for hiding. */
export const UNUSED_CAPABILITY_STALE_DAYS = 60;

export type ModulePreferenceForSuggestion = {
  readonly moduleKey: string;
  readonly enabled: boolean | null;
  readonly firstUsedAt: Date | null;
};

export function parseUnusedCapabilityDismissals(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function isStaleOrNeverUsed(firstUsedAt: Date | null, now: Date): boolean {
  if (firstUsedAt == null) return true;
  const cutoffMs = now.getTime() - UNUSED_CAPABILITY_STALE_DAYS * 24 * 60 * 60 * 1000;
  return firstUsedAt.getTime() < cutoffMs;
}

function priorityRank(key: OptionalModuleKey): number {
  const idx = (UNUSED_CAPABILITY_PRIORITY as readonly string[]).indexOf(key);
  return idx === -1 ? UNUSED_CAPABILITY_PRIORITY.length + 1 : idx;
}

/**
 * Suggest customer modules that are explicitly enabled but unused / stale.
 * Documents with any usage (firstUsedAt set) are never suggested — data exists.
 * Never auto-hides; callers must filter dismissed keys separately if needed.
 * Priority: BOQ, month-close, budgets, quotes, procurement, changes first.
 */
export function suggestUnusedCapabilities(
  preferences: readonly ModulePreferenceForSuggestion[],
  options?: {
    readonly dismissedKeys?: readonly string[];
    readonly now?: Date;
  },
): readonly OptionalModuleKey[] {
  const now = options?.now ?? new Date();
  const dismissed = new Set(options?.dismissedKeys ?? []);
  const customerKeys = new Set<string>(CUSTOMER_FEATURE_MODULE_KEYS);
  const byKey = new Map(preferences.map((pref) => [pref.moduleKey, pref]));

  const suggested: OptionalModuleKey[] = [];

  for (const key of CUSTOMER_FEATURE_MODULE_KEYS) {
    if (NEVER_SUGGEST.has(key)) continue;
    if (dismissed.has(key)) continue;

    const pref = byKey.get(key);
    if (!pref || pref.enabled !== true) continue;
    if (!customerKeys.has(key)) continue;

    // Documents with any recorded use imply existing data — keep out of suggestions.
    if (key === 'documents' && pref.firstUsedAt != null) continue;

    if (!isStaleOrNeverUsed(pref.firstUsedAt, now)) continue;

    suggested.push(key);
  }

  return [...suggested].sort((a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b));
}

/**
 * Adjacent discoverability tips for capabilities that are not standalone
 * feature toggles (retention, recurring drafts, multi-contract) plus core
 * modules that owners often overlook.
 */
export function listDiscoverabilityTipKeys(
  preferences: readonly ModulePreferenceForSuggestion[],
  options?: {
    readonly dismissedKeys?: readonly string[];
    readonly now?: Date;
  },
): readonly DiscoverabilityTipKey[] {
  const unused = new Set(suggestUnusedCapabilities(preferences, options));
  const tips: DiscoverabilityTipKey[] = [];

  if (unused.has('boq')) tips.push('boq');
  if (unused.has('month_close')) tips.push('month_close');

  const billing = preferences.find((pref) => pref.moduleKey === 'billing');
  if (billing?.enabled === true && isStaleOrNeverUsed(billing.firstUsedAt, options?.now ?? new Date())) {
    if (!options?.dismissedKeys?.includes('retention')) tips.push('retention');
  }

  const overhead = preferences.find((pref) => pref.moduleKey === 'overhead');
  const expensesAdjacent = overhead?.enabled === true || billing?.enabled === true;
  if (
    expensesAdjacent &&
    !options?.dismissedKeys?.includes('recurring_drafts') &&
    isStaleOrNeverUsed(overhead?.firstUsedAt ?? billing?.firstUsedAt ?? null, options?.now ?? new Date())
  ) {
    tips.push('recurring_drafts');
  }

  // Multi-contract is always a soft tip when projects work is active (no module key).
  if (!options?.dismissedKeys?.includes('multi_contract')) {
    tips.push('multi_contract');
  }

  return tips;
}
