/**
 * Development / Owner experience preview override.
 * Cookie-only visual layer — never mutates organization configuration.
 */

import {
  getBusinessProfile,
  type BusinessProfile,
  type BusinessProfileKey,
  type QuickCreateEmphasisKey,
  type SuggestedBusinessDefaults,
} from './business-profiles';
import type { WorkMix } from './work-mix';
import {
  OPTIONAL_MODULE_KEYS,
  type ModuleVisibility,
} from './types';

/** Cookie name — easy to remove when Owner retires the switcher. */
export const EXPERIENCE_PREVIEW_COOKIE = 'pf_experience_preview';

/**
 * Curated Owner QA preview targets (maps onto business profile keys + actual).
 * Text-only labels live in locales — this list is the switcher contract.
 */
export const EXPERIENCE_PREVIEW_PROFILE_KEYS = [
  'GENERAL_CONTRACTOR',
  'ELECTRICAL',
  'RENOVATION',
  'SMALL_WORKS',
  'FIELD_SERVICE',
  'ARCHITECT',
  'ENGINEERING_CONSULTANT',
  'SAFETY_INSPECTION_CONSULTANT',
  'MIXED_PROJECT_SERVICE',
  'ALL_CAPABILITIES',
] as const;

export type ExperiencePreviewProfileKey = (typeof EXPERIENCE_PREVIEW_PROFILE_KEYS)[number];

export type ExperiencePreviewSelection = ExperiencePreviewProfileKey | 'actual';

export function isExperiencePreviewProfileKey(
  value: string | null | undefined,
): value is ExperiencePreviewProfileKey {
  return (
    typeof value === 'string' &&
    (EXPERIENCE_PREVIEW_PROFILE_KEYS as readonly string[]).includes(value)
  );
}

export function parseExperiencePreviewSelection(
  raw: string | null | undefined,
): ExperiencePreviewSelection {
  if (!raw || raw === 'actual') return 'actual';
  if (isExperiencePreviewProfileKey(raw)) return raw;
  return 'actual';
}

export interface ExperiencePreviewResolved {
  readonly selection: ExperiencePreviewSelection;
  readonly active: boolean;
  readonly profileKey: BusinessProfileKey | null;
  readonly modules: ModuleVisibility | null;
  readonly workMix: WorkMix | null;
  readonly quickCreateEmphasis: readonly QuickCreateEmphasisKey[] | null;
  readonly suggestedDefaults: SuggestedBusinessDefaults | null;
  readonly labelKey: string;
}

function modulesFromProfile(profile: BusinessProfile): ModuleVisibility {
  const enabled = new Set<string>(profile.visibleModules);
  return Object.fromEntries(
    OPTIONAL_MODULE_KEYS.map((key) => {
      if (key === 'portal') return [key, false];
      if (key === 'command_center') return [key, true];
      if (profile.key === 'ALL_CAPABILITIES') {
        return [key, true];
      }
      return [key, enabled.has(key)];
    }),
  ) as ModuleVisibility;
}

/**
 * Resolve a preview selection into shell overrides.
 * `actual` → no overrides (active=false).
 */
export function resolveExperiencePreview(
  selection: ExperiencePreviewSelection,
): ExperiencePreviewResolved {
  if (selection === 'actual') {
    return {
      selection: 'actual',
      active: false,
      profileKey: null,
      modules: null,
      workMix: null,
      quickCreateEmphasis: null,
      suggestedDefaults: null,
      labelKey: 'actual',
    };
  }

  const profile = getBusinessProfile(selection);
  if (!profile) {
    return resolveExperiencePreview('actual');
  }

  return {
    selection,
    active: true,
    profileKey: profile.key,
    modules: modulesFromProfile(profile),
    workMix: profile.workMix,
    quickCreateEmphasis: profile.quickCreateEmphasis,
    suggestedDefaults: profile.suggestedDefaults,
    labelKey: selection,
  };
}

/**
 * Gate: development/preview environments, or explicit server flag.
 * Production stays off unless PF_EXPERIENCE_PREVIEW=1 for Owner staging.
 */
export function isExperiencePreviewEnvironment(
  appEnv: string | undefined,
  flag: string | undefined,
): boolean {
  if (flag === '1' || flag === 'true') return true;
  return appEnv === 'local' || appEnv === 'preview';
}

/** Owner role only — not permission-by-obscurity for normal members. */
export function canUseExperiencePreview(
  roleKeys: readonly string[],
  appEnv: string | undefined,
  flag: string | undefined,
): boolean {
  if (!isExperiencePreviewEnvironment(appEnv, flag)) return false;
  return roleKeys.includes('owner');
}
