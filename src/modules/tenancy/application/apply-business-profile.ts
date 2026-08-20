import { organizationDomains, costCategories } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import { setModulePreference } from '../data/organizations.repository';
import {
  BUSINESS_PROFILE_SETTING_KEY,
  QUICK_CREATE_EMPHASIS_SETTING_KEY,
  SUGGESTED_DEFAULTS_SETTING_KEY,
  TERMINOLOGY_SETTING_KEY,
  getBusinessProfile,
  type BusinessProfileKey,
  type QuickCreateEmphasisKey,
  type WorkTerminologyLabels,
  parseQuickCreateEmphasis,
  parseSuggestedDefaults,
  parseTerminology,
  type SuggestedBusinessDefaults,
} from '../domain/business-profiles';
import {
  CAPABILITY_MODE_SETTING_KEY,
  modulePreferenceWritesForProfile,
  type ApplyModulePreferenceMode,
} from '../domain/capability-overrides';
import { requiredFoundationsFor } from '../domain/capability-registry';
import type { OptionalModuleKey } from '../domain/types';
import { isWorkMix, WORK_MIX_SETTING_KEY } from '../domain/work-mix';
import { seedBusinessProfileSetup } from './seed-business-profile-setup';

export type ApplyBusinessProfileOptions = {
  /** Default additive — safe for existing tenants. */
  readonly moduleMode?: ApplyModulePreferenceMode;
  /** Extra customer modules enabled on top of the profile recommendation. */
  readonly extraModules?: readonly OptionalModuleKey[];
  /** Override profile work mix when the user answered onboarding Q2. */
  readonly workMixOverride?: string;
};

/**
 * Applies a business profile as editable configuration only.
 * Writes organization_settings JSON (no schema fork). Never forks financial
 * logic, never deletes existing rows, never enables portal, never bypasses permissions.
 */
export async function applyBusinessProfileConfig(
  db: DbExecutor,
  organizationId: string,
  profileKey: BusinessProfileKey,
  locale: 'he-IL' | 'en' = 'he-IL',
  options?: ApplyBusinessProfileOptions,
): Promise<{ applied: true; profileKey: BusinessProfileKey } | { applied: false }> {
  const profile = getBusinessProfile(profileKey);
  if (!profile) return { applied: false };

  const moduleMode: ApplyModulePreferenceMode = options?.moduleMode ?? 'additive';
  const nameOf = (en: string, he: string) => (locale === 'he-IL' ? he : en);

  const workMix =
    options?.workMixOverride && isWorkMix(options.workMixOverride)
      ? options.workMixOverride
      : profile.workMix;

  await upsertOrganizationSettingValue(db, organizationId, BUSINESS_PROFILE_SETTING_KEY, profileKey);
  await upsertOrganizationSettingValue(db, organizationId, WORK_MIX_SETTING_KEY, workMix);
  await upsertOrganizationSettingValue(db, organizationId, TERMINOLOGY_SETTING_KEY, profile.terminology);
  await upsertOrganizationSettingValue(
    db,
    organizationId,
    QUICK_CREATE_EMPHASIS_SETTING_KEY,
    profile.quickCreateEmphasis,
  );
  await upsertOrganizationSettingValue(
    db,
    organizationId,
    SUGGESTED_DEFAULTS_SETTING_KEY,
    profile.suggestedDefaults,
  );

  const moduleWrites = modulePreferenceWritesForProfile(profileKey, moduleMode);
  for (const { moduleKey, enabled } of moduleWrites) {
    if (moduleKey === 'portal') continue;
    await setModulePreference(db, organizationId, moduleKey, enabled);
  }

  for (const moduleKey of options?.extraModules ?? []) {
    if (moduleKey === 'portal') continue;
    for (const foundation of requiredFoundationsFor(moduleKey)) {
      await setModulePreference(db, organizationId, foundation, true);
    }
    await setModulePreference(db, organizationId, moduleKey, true);
  }

  if (profileKey === 'ALL_CAPABILITIES' || moduleMode === 'replace') {
    await upsertOrganizationSettingValue(
      db,
      organizationId,
      CAPABILITY_MODE_SETTING_KEY,
      profileKey === 'ALL_CAPABILITIES' ? 'all' : 'profile',
    );
  }

  let sort = 0;
  for (const domain of profile.domains) {
    await db
      .insert(organizationDomains)
      .values({
        organizationId,
        key: domain.key,
        name: nameOf(domain.nameEn, domain.nameHe),
        enabled: true,
        sortOrder: sort++,
      })
      .onConflictDoNothing();
  }

  let categorySort = 300;
  for (const category of profile.costCategories) {
    await db
      .insert(costCategories)
      .values({
        organizationId,
        key: category.key,
        name: nameOf(category.nameEn, category.nameHe),
        family: category.family,
        isSystem: false,
        sortOrder: categorySort++,
      })
      .onConflictDoNothing();
  }

  await seedBusinessProfileSetup(db, organizationId, profileKey, locale);

  return { applied: true, profileKey };
}

export async function getBusinessProfileKeyForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<BusinessProfileKey | null> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    BUSINESS_PROFILE_SETTING_KEY,
  );
  if (typeof raw === 'string') {
    return getBusinessProfile(raw)?.key ?? null;
  }
  return null;
}

export async function getTerminologyForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<WorkTerminologyLabels | null> {
  const raw = await getOrganizationSettingValue<unknown>(db, organizationId, TERMINOLOGY_SETTING_KEY);
  return parseTerminology(raw);
}

export async function getQuickCreateEmphasisForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<readonly QuickCreateEmphasisKey[] | null> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    QUICK_CREATE_EMPHASIS_SETTING_KEY,
  );
  return parseQuickCreateEmphasis(raw);
}

export async function getSuggestedDefaultsForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<SuggestedBusinessDefaults | null> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    SUGGESTED_DEFAULTS_SETTING_KEY,
  );
  return parseSuggestedDefaults(raw);
}

/** Reorder Quick Create actions so profile emphasis comes first; unknown keys ignored. */
export function orderQuickCreateActions<T extends { key: string }>(
  actions: readonly T[],
  emphasis: readonly QuickCreateEmphasisKey[] | null | undefined,
): T[] {
  if (!emphasis?.length) return [...actions];
  const byKey = new Map(actions.map((action) => [action.key, action]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const key of emphasis) {
    const action = byKey.get(key);
    if (action) {
      ordered.push(action);
      seen.add(key);
    }
  }
  for (const action of actions) {
    if (!seen.has(action.key)) ordered.push(action);
  }
  return ordered;
}
