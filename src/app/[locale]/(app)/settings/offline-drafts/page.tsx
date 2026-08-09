import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { OfflineDraftsPanel } from '@/modules/offline/ui/offline-drafts-panel';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('offlineDrafts');
}

export default async function OfflineDraftsSettingsPage() {
  const t = await getTranslations('offline');
  const organizationId = await withOrgContext(async (context) => context.organizationId);

  return (
    <SettingsPageShell title={t('page.title')} description={t('page.subtitle')}>
      <OfflineDraftsPanel organizationId={organizationId} />
    </SettingsPageShell>
  );
}
