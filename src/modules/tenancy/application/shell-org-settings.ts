import type { DbExecutor } from '@/shared/db/types';
import { listOrganizationSettingValues } from '../data/organization-settings.repository';
import {
  parseCapabilityCustomizationMode,
  CAPABILITY_MODE_SETTING_KEY,
  type CapabilityCustomizationMode,
} from '../domain/capability-overrides';
import {
  BUSINESS_PROFILE_SETTING_KEY,
  getBusinessProfile,
  parseQuickCreateEmphasis,
  parseSuggestedDefaults,
  QUICK_CREATE_EMPHASIS_SETTING_KEY,
  SUGGESTED_DEFAULTS_SETTING_KEY,
  type BusinessProfileKey,
  type QuickCreateEmphasisKey,
  type SuggestedBusinessDefaults,
} from '../domain/business-profiles';
import {
  EXPERIENCE_COMPLEXITY_SETTING_KEY,
  parseExperienceComplexity,
  type ExperienceComplexityKey,
} from '../domain/experience-complexity';
import { parseWorkMix, WORK_MIX_SETTING_KEY, type WorkMix } from '../domain/work-mix';

const SHELL_SETTING_KEYS = [
  WORK_MIX_SETTING_KEY,
  BUSINESS_PROFILE_SETTING_KEY,
  QUICK_CREATE_EMPHASIS_SETTING_KEY,
  SUGGESTED_DEFAULTS_SETTING_KEY,
  EXPERIENCE_COMPLEXITY_SETTING_KEY,
  CAPABILITY_MODE_SETTING_KEY,
] as const;

export type ShellOrgSettings = {
  readonly workMix: WorkMix;
  readonly businessProfileKey: BusinessProfileKey | null;
  readonly quickCreateEmphasis: readonly QuickCreateEmphasisKey[] | null;
  readonly suggestedDefaults: SuggestedBusinessDefaults | null;
  readonly complexity: ExperienceComplexityKey;
  readonly customizationMode: CapabilityCustomizationMode | null;
};

/** Batched read for app shell — replaces six separate setting queries per navigation. */
export async function loadShellOrgSettings(
  db: DbExecutor,
  organizationId: string,
): Promise<ShellOrgSettings> {
  const values = await listOrganizationSettingValues(db, organizationId, SHELL_SETTING_KEYS);

  const profileRaw = values.get(BUSINESS_PROFILE_SETTING_KEY);
  const businessProfileKey =
    typeof profileRaw === 'string' ? (getBusinessProfile(profileRaw)?.key ?? null) : null;

  return {
    workMix: parseWorkMix(values.get(WORK_MIX_SETTING_KEY)),
    businessProfileKey,
    quickCreateEmphasis: parseQuickCreateEmphasis(values.get(QUICK_CREATE_EMPHASIS_SETTING_KEY)),
    suggestedDefaults: parseSuggestedDefaults(values.get(SUGGESTED_DEFAULTS_SETTING_KEY)),
    complexity: parseExperienceComplexity(values.get(EXPERIENCE_COMPLEXITY_SETTING_KEY)) ?? 'full',
    customizationMode: parseCapabilityCustomizationMode(values.get(CAPABILITY_MODE_SETTING_KEY)),
  };
}
