import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { getModuleVisibility, listModulePreferences } from '@/modules/tenancy';
import { getBusinessProfileKeyForOrg } from '@/modules/tenancy/application/apply-business-profile';
import { SettingsPageShell } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { FeaturesSettingsPanel } from '../features/features-panel';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  return { title: t('modules.pageTitle') };
}

export default async function ModulesSettingsPage() {
  const t = await getTranslations('settings.modules');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.SETTINGS_MANAGE)) {
      return { allowed: false as const };
    }

    const [visibility, profileKey, preferences] = await Promise.all([
      getModuleVisibility(context),
      getBusinessProfileKeyForOrg(context.db, context.organizationId),
      listModulePreferences(context.db, context.organizationId),
    ]);

    return {
      allowed: true as const,
      visibility,
      preferences,
      hasBusinessProfile: Boolean(profileKey),
      canEdit: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('pageTitle')} description={t('pageDescription')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('pageTitle')} description={t('pageDescription')}>
      <Card className="p-5">
        <FeaturesSettingsPanel
          visibility={data.visibility}
          preferences={data.preferences}
          canEdit={data.canEdit}
          hasBusinessProfile={data.hasBusinessProfile}
        />
      </Card>
    </SettingsPageShell>
  );
}
