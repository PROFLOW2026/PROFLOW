import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Plug } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { listAccountingIntegrations } from '@/modules/integrations';
import { getSumitConnectionStatus } from '@/modules/invoicing-integration/server';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { SumitIntegrationPanel } from './sumit-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('integrations');
}

export default async function IntegrationsSettingsPage() {
  const t = await getTranslations('integrations');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'integrations');

  const data = await withOrgContext(async (context) => {
    if (section && !canAccessSection(context, section)) return { allowed: false as const };
    try {
      const listed = await listAccountingIntegrations(context);
      const sumit = await getSumitConnectionStatus(context);
      const canManageSumit = context.permissions.has(PERMISSIONS.SETTINGS_MANAGE);
      return { allowed: true as const, ...listed, sumit, canManageSumit };
    } catch {
      return {
        allowed: true as const,
        catalog: [],
        mappingCount: 0,
        syncJobs: [],
        adapterConnected: false as const,
        canManage: false,
        sumit: { connected: false, companyId: null, providerId: null },
        canManageSumit: false,
      };
    }
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
      <div className="flex flex-col gap-4">
        <Alert tone="warning">{t('notice')}</Alert>
        <SumitIntegrationPanel
          connected={data.sumit.connected}
          companyId={data.sumit.companyId}
          canManage={data.canManageSumit}
        />
        {data.catalog.length === 0 ? (
          <EmptyState icon={Plug} title={t('empty.title')} description={t('empty.body')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.catalog.map((item) => (
              <li key={item.providerKey}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t(`providers.${item.providerKey}`)}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-[var(--pf-text-secondary)]">
                    <p>{t(`status.${item.status}`)}</p>
                    <p>{t('neverConnected')}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsPageShell>
  );
}
