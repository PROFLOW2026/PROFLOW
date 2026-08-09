import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  getLaborCostDefaults,
  listOrganizationDocumentTypes,
  listOrganizationServiceDomains,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { CatalogSettingsPanel } from './catalog-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('catalog');
}

export default async function CatalogSettingsPage() {
  const t = await getTranslations('settings.catalog');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'catalog')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const [domains, documentTypes, laborDefaults] = await Promise.all([
      listOrganizationServiceDomains(context),
      listOrganizationDocumentTypes(context),
      getLaborCostDefaults(context),
    ]);
    return {
      allowed: true as const,
      domains,
      documentTypes,
      laborDefaults,
      canEdit: canManageSection(context, 'catalog'),
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
        <CatalogSettingsPanel
          domains={data.domains}
          documentTypes={data.documentTypes}
          laborDefaults={data.laborDefaults}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}
