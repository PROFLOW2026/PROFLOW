import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import {
  getBusinessProfileKeyForOrg,
  getExperienceComplexityForOrg,
  getModuleVisibility,
  getUnusedCapabilityDismissals,
  getWorkMixForOrg,
  isOptionalModuleKey,
  suggestUnusedCapabilities,
  type OptionalModuleKey,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { listModulePreferencesForOrg } from '../_lib/module-preferences';
import { BusinessProfilePresetForm } from '../business/business-profile-preset-form';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { ComplexityPanel } from './complexity-panel';
import { FeaturesSettingsPanel } from './features-panel';
import { UnusedCapabilitySuggestionBanner } from './unused-capability-suggestion-banner';
import { WorkMixPanel } from './work-mix-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('features');
}

export default async function FeaturesSettingsPage() {
  const t = await getTranslations('settings.modules');
  const tProfiles = await getTranslations('settings.businessProfiles');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'features')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const [visibility, preferences, workMix, currentProfileKey, complexity, dismissals] =
      await Promise.all([
        getModuleVisibility(context),
        listModulePreferencesForOrg(context),
        getWorkMixForOrg(context),
        getBusinessProfileKeyForOrg(context.db, context.organizationId),
        getExperienceComplexityForOrg(context),
        getUnusedCapabilityDismissals(context),
      ]);

    const suggestions = suggestUnusedCapabilities(preferences, {
      dismissedKeys: dismissals,
    });
    const suggestionKey = suggestions[0];
    const unusedSuggestion: OptionalModuleKey | null =
      suggestionKey && isOptionalModuleKey(suggestionKey) ? suggestionKey : null;

    return {
      allowed: true as const,
      visibility,
      preferences,
      workMix,
      complexity,
      currentProfileKey,
      unusedSuggestion,
      canEdit: canManageSection(context, 'features'),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  const showFirstRun = data.canEdit && !data.currentProfileKey;

  return (
    <SettingsPageShell title={t('title')}>
      {data.unusedSuggestion ? (
        <UnusedCapabilitySuggestionBanner
          moduleKey={data.unusedSuggestion}
          canEdit={data.canEdit}
        />
      ) : null}
      {showFirstRun ? (
        <Card className="mb-4 flex flex-col gap-3 p-5">
          <Alert tone="info">
            <p className="font-medium">{tProfiles('firstRunTitle')}</p>
            <p className="mt-1 text-sm">{tProfiles('firstRunBody')}</p>
          </Alert>
          <BusinessProfilePresetForm canEdit={data.canEdit} currentProfileKey={null} />
        </Card>
      ) : null}
      <Card className="flex flex-col gap-2 p-5">
        <WorkMixPanel initialWorkMix={data.workMix} canEdit={data.canEdit} />
        <ComplexityPanel initialComplexity={data.complexity} canEdit={data.canEdit} />
        <FeaturesSettingsPanel
          visibility={data.visibility}
          preferences={data.preferences}
          canEdit={data.canEdit}
          hasBusinessProfile={Boolean(data.currentProfileKey)}
        />
      </Card>
    </SettingsPageShell>
  );
}
