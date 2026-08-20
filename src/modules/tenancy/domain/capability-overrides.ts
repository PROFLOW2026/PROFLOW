/**
 * Organization capability application modes.
 * Profile recommendations vs explicit overrides stay distinct.
 */

import type { BusinessProfileKey } from './business-profiles';
import { getBusinessProfile } from './business-profiles';
import { CUSTOMER_FEATURE_MODULE_KEYS, type OptionalModuleKey } from './types';

export const CAPABILITY_MODE_SETTING_KEY = 'capability_customization_mode';

export const CAPABILITY_CUSTOMIZATION_MODES = ['profile', 'custom', 'all'] as const;
export type CapabilityCustomizationMode = (typeof CAPABILITY_CUSTOMIZATION_MODES)[number];

export function parseCapabilityCustomizationMode(
  value: unknown,
): CapabilityCustomizationMode | null {
  if (value === 'profile' || value === 'custom' || value === 'all') return value;
  return null;
}

export type ApplyModulePreferenceMode = 'additive' | 'replace';

/**
 * Compute module preference writes for a business profile.
 * - additive: only turn recommended modules ON (safe for existing tenants)
 * - replace: recommended ON, other customer toggles OFF (new onboarding / reset)
 */
export function modulePreferenceWritesForProfile(
  profileKey: BusinessProfileKey,
  mode: ApplyModulePreferenceMode,
): readonly { moduleKey: OptionalModuleKey; enabled: boolean }[] {
  const profile = getBusinessProfile(profileKey);
  if (!profile) return [];

  const recommended = new Set<OptionalModuleKey>(
    profile.visibleModules.filter((key) => key !== 'portal'),
  );

  if (profileKey === 'ALL_CAPABILITIES' || mode === 'additive') {
    const keys =
      profileKey === 'ALL_CAPABILITIES'
        ? CUSTOMER_FEATURE_MODULE_KEYS
        : ([...recommended] as OptionalModuleKey[]);
    return keys
      .filter((key) => key !== 'portal')
      .map((moduleKey) => ({ moduleKey, enabled: true }));
  }

  // replace: set every customer toggle explicitly
  return CUSTOMER_FEATURE_MODULE_KEYS.map((moduleKey) => ({
    moduleKey,
    enabled: recommended.has(moduleKey),
  }));
}
