import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listClientsForOrg } from '@/modules/clients';
import { listProjectsForOrg } from '@/modules/projects';
import { listCustomerGrants } from '@/modules/portal';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { PortalGrantsPanel } from './portal-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('portal');
}

export default async function PortalSettingsPage() {
  const t = await getTranslations('portal');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'portal')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const [grants, clients, projects] = await Promise.all([
      listCustomerGrants(context),
      listClientsForOrg(context, {}).catch(() => []),
      listProjectsForOrg(context, {}).catch(() => []),
    ]);

    return {
      allowed: true as const,
      grants,
      clients: clients.map((client) => ({ id: client.id, name: client.name })),
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      canEdit: canManageSection(context, 'portal'),
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
        <PortalGrantsPanel
          grants={data.grants}
          clients={data.clients}
          projects={data.projects}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}
