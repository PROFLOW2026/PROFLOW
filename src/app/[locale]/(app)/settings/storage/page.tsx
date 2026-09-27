import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  isOrganizationStorageConfigured,
  listConfiguredStorageProviders,
  listOrganizationStorageConnections,
} from '@/modules/external-storage/server';
import { loadStorageSettingsPageData } from '@/modules/external-storage/application/settings-page-data';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { StorageSettingsPanel } from './storage-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('storage');
}

export default async function StorageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const t = await getTranslations('externalStorage');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'storage');
  const query = await searchParams;

  const data = await withOrgContext(async (context) => {
    if (section && !canAccessSection(context, section)) return { allowed: false as const };
    const [rawConnections, storageActive] = await Promise.all([
      listOrganizationStorageConnections(context),
      isOrganizationStorageConfigured(context),
    ]);
    const settingsData = await loadStorageSettingsPageData(context, rawConnections);
    return {
      allowed: true as const,
      connections: settingsData.connections,
      storageActive,
      canManage: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
      provisionProgress: settingsData.provisionProgress,
      provisionProgressUnavailable: settingsData.provisionProgressUnavailable,
      pageWarnings: settingsData.pageWarnings,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  const configuredProviders = listConfiguredStorageProviders();

  return (
    <SettingsPageShell title={t('title')}>
      {query.connected ? <AlertSuccess message={t('oauthSuccess')} /> : null}
      {query.error ? <AlertFailed message={t('oauthFailed')} /> : null}
      {data.pageWarnings.map((warningKey) => (
        <AlertWarning key={warningKey} message={t(warningKey)} />
      ))}
      <StorageSettingsPanel
        connections={data.connections}
        configuredProviders={configuredProviders}
        storageActive={data.storageActive}
        canManage={data.canManage}
        provisionProgress={data.provisionProgress}
        provisionProgressUnavailable={data.provisionProgressUnavailable}
      />
    </SettingsPageShell>
  );
}

function AlertSuccess({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)] px-4 py-3 text-sm">
      {message}
    </div>
  );
}

function AlertFailed({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] px-4 py-3 text-sm">
      {message}
    </div>
  );
}

function AlertWarning({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm">
      {message}
    </div>
  );
}
