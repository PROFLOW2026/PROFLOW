import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listApiPlatform } from '@/modules/api';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { ApiSettingsPanel } from './api-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('api');
}

export default async function ApiSettingsPage() {
  const t = await getTranslations('api');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'api')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const platform = await listApiPlatform(context);
    return {
      allowed: true as const,
      ...platform,
      canEdit: canManageSection(context, 'api'),
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
        <ApiSettingsPanel
          clients={data.clients}
          keys={data.keys}
          endpoints={data.endpoints}
          deliveries={data.deliveries}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}
