import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { getModuleVisibility } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { listModulePreferencesForOrg } from '../_lib/module-preferences';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { FeaturesSettingsPanel } from './features-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('features');
}

export default async function FeaturesSettingsPage() {
  const t = await getTranslations('settings.modules');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'features')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const [visibility, preferences] = await Promise.all([
      getModuleVisibility(context),
      listModulePreferencesForOrg(context),
    ]);

    return {
      allowed: true as const,
      visibility,
      preferences,
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

  return (
    <SettingsPageShell title={t('title')}>
      <Card className="p-5">
        <FeaturesSettingsPanel
          visibility={data.visibility}
          preferences={data.preferences}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}
