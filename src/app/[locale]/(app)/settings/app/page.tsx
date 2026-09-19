import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  getDashboardQuickAccessPreference,
  listDashboardQuickAccessCatalogForOrg,
} from '@/modules/tenancy/application/dashboard-quick-access';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { PwaInstallPanel } from '@/modules/offline/ui/pwa-install-panel';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { DashboardQuickAccessPanel } from './dashboard-quick-access-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('app');
}

export default async function AppSettingsPage() {
  const [tInstall, tDashboardDisplay] = await Promise.all([
    getTranslations('offline.install'),
    getTranslations('settings.dashboardDisplay'),
  ]);

  const dashboardPrefs = await withOrgContext(async (context) => {
    const [initialKeys, catalog] = await Promise.all([
      getDashboardQuickAccessPreference(context),
      listDashboardQuickAccessCatalogForOrg(context),
    ]);
    return {
      initialKeys,
      catalog,
      canEdit: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
    };
  });

  return (
    <SettingsPageShell title={tInstall('pageTitle')} description={tInstall('pageSubtitle')}>
      <section className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{tDashboardDisplay('title')}</h2>
        </div>
        <DashboardQuickAccessPanel
          initialKeys={dashboardPrefs.initialKeys}
          catalog={dashboardPrefs.catalog}
          canEdit={dashboardPrefs.canEdit}
        />
      </section>
      <PwaInstallPanel />
    </SettingsPageShell>
  );
}
