import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import {
  getBusinessProfileKeyForOrg,
  getModuleVisibility,
  getWorkMixForOrg,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { listModulePreferencesForOrg } from '../_lib/module-preferences';
import { BusinessProfilePresetForm } from '../business/business-profile-preset-form';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { FeaturesSettingsPanel } from './features-panel';
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

    const [visibility, preferences, workMix, currentProfileKey] = await Promise.all([
      getModuleVisibility(context),
      listModulePreferencesForOrg(context),
      getWorkMixForOrg(context),
      getBusinessProfileKeyForOrg(context.db, context.organizationId),
    ]);

    return {
      allowed: true as const,
      visibility,
      preferences,
      workMix,
      currentProfileKey,
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
