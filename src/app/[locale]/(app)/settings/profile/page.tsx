import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { findProfile } from '@/modules/identity';
import { withOrgContext } from '@/shared/auth/session';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { ProfileSettingsForm } from './profile-form';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('profile');
}

export default async function ProfileSettingsPage() {
  const t = await getTranslations('settings.profile');

  const profile = await withOrgContext(async (context) => findProfile(context.db, context.userId));

  return (
    <SettingsPageShell title={t('title')}>
      <Card className="p-5">
        <ProfileSettingsForm
          displayName={profile?.displayName ?? null}
          localePreference={profile?.localePreference ?? null}
          email={profile?.email ?? ''}
        />
      </Card>
    </SettingsPageShell>
  );
}
