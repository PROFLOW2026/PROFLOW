import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { getOrganizationSettingValue } from '@/modules/tenancy';
import { SettingsPageShell } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { AdoptionPanel } from './adoption-panel';
import {
  ORG_PROFILE_TYPE_SETTING_KEY,
  isOrgProfileType,
  type OrgProfileType,
} from '../org-profile/org-profile-domain';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  const tAdoption = await getTranslations('settings.adoption');
  return { title: `${tAdoption('nav')} - ${t('title')}` };
}

export default async function AdoptionSettingsPage() {
  const tNav = await getTranslations('settings.adoption');
  const tPanel = await getTranslations('settings.adoptionPanel');
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.SETTINGS_MANAGE)) {
      return { allowed: false as const };
    }

    const rawProfileType = await getOrganizationSettingValue<string>(
      context.db,
      context.organizationId,
      ORG_PROFILE_TYPE_SETTING_KEY,
    );

    const currentProfileType: OrgProfileType | null =
      isOrgProfileType(rawProfileType) ? rawProfileType : null;

    return { allowed: true as const, currentProfileType };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={tNav('nav')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={tNav('nav')} description={tPanel('pageDescription')}>
      <Card className="p-5">
        <AdoptionPanel currentProfileType={data.currentProfileType} />
      </Card>
    </SettingsPageShell>
  );
}
