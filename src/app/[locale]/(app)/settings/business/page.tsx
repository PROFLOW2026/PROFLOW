import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { BusinessProfileForm } from './business-profile-form';
import { ProfessionPresetForm } from './profession-preset-form';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('business');
}

export default async function BusinessSettingsPage() {
  const tOrg = await getTranslations('organization.profile');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'business')!;

  const { organization, allowed, canEdit } = await withOrgContext(async (context) => ({
    organization: context.organization,
    allowed: canAccessSection(context, section),
    canEdit: canManageSection(context, 'business'),
  }));

  if (!allowed) {
    return (
      <SettingsPageShell title={tOrg('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={tOrg('title')}>
      <Card className="flex flex-col gap-6 p-5">
        <BusinessProfileForm organization={organization} canEdit={canEdit} />
        <ProfessionPresetForm canEdit={canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
