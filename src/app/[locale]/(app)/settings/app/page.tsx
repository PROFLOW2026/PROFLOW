import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PwaInstallPanel } from '@/modules/offline/ui/pwa-install-panel';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('app');
}

export default async function AppSettingsPage() {
  const t = await getTranslations('offline.install');
  // Ensure session/org context is valid for settings chrome (same pattern as offline drafts).
  await withOrgContext(async (context) => context.organizationId);

  return (
    <SettingsPageShell title={t('pageTitle')} description={t('pageSubtitle')}>
      <PwaInstallPanel />
    </SettingsPageShell>
  );
}
