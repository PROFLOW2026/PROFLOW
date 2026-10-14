import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { findProfile } from '@/modules/identity';
import { withOrgContext } from '@/shared/auth/session';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { ProfileSettingsForm } from './profile-form';
import { CalendarFeedPanel } from './calendar-feed-panel';
import { publicEnv } from '@/shared/env/public';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('profile');
}

export default async function ProfileSettingsPage() {
  const t = await getTranslations('settings.profile');

  const profile = await withOrgContext(async (context) => findProfile(context.db, context.userId));
  const appOrigin = publicEnv.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';

  return (
    <SettingsPageShell title={t('title')}>
      <Card className="flex flex-col gap-5 p-5">
        <ProfileSettingsForm
          displayName={profile?.displayName ?? null}
          localePreference={profile?.localePreference ?? null}
          email={profile?.email ?? ''}
        />
        <CalendarFeedPanel appOrigin={appOrigin} />
      </Card>
    </SettingsPageShell>
  );
}
