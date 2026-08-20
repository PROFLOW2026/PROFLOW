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

/**
 * Suggest customer modules that are explicitly enabled but unused / stale.
 * Documents with any usage (firstUsedAt set) are never suggested — data exists.
 * Never auto-hides; callers must filter dismissed keys separately if needed.
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

  return suggested;
}
