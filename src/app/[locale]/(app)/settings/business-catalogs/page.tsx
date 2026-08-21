import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  getCostCodesEnabled,
  getDefaultPaymentTermKey,
  listBusinessCatalog,
  listDocumentRequirements,
} from '@/modules/business-catalog/application/manage-catalog';
import { BUSINESS_CATALOG_KINDS } from '@/modules/business-catalog/domain/types';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { BusinessCatalogsPanel } from './business-catalogs-panel';
import type { CatalogEntryView, DocumentRequirementView } from './_lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('businessCatalogs');
}

export default async function BusinessCatalogsSettingsPage() {
  const t = await getTranslations('settings.businessCatalogs');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'businessCatalogs')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const entriesByKind = {} as Record<string, CatalogEntryView[]>;
    await Promise.all(
      BUSINESS_CATALOG_KINDS.map(async (kind) => {
        const rows = await listBusinessCatalog(context, kind, { forManage: true });
        entriesByKind[kind] = rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          key: row.key,
          name: row.name,
          description: row.description,
          parentId: row.parentId,
          metadata: row.metadata,
          sortOrder: row.sortOrder,
          isSystem: row.isSystem,
          isActive: row.isActive,
        }));
      }),
    );

    const [docReqs, costCodesEnabled, defaultPaymentTermKey] = await Promise.all([
      listDocumentRequirements(context, { forManage: true }),
      getCostCodesEnabled(context),
      getDefaultPaymentTermKey(context),
    ]);

    const documentRequirements: DocumentRequirementView[] = docReqs
      .filter(
        (row): row is typeof row & { contextKind: 'vendor_type' | 'subcontract' } =>
          row.contextKind === 'vendor_type' || row.contextKind === 'subcontract',
      )
      .map((row) => ({
        id: row.id,
        contextKind: row.contextKind,
        contextKey: row.contextKey,
        documentTypeKey: row.documentTypeKey,
        label: row.label,
        required: row.required,
        isActive: row.isActive,
      }));

    return {
      allowed: true as const,
      entriesByKind: entriesByKind as Record<(typeof BUSINESS_CATALOG_KINDS)[number], CatalogEntryView[]>,
      documentRequirements,
      costCodesEnabled,
      defaultPaymentTermKey,
      canEdit: canManageSection(context, 'businessCatalogs'),
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
        <BusinessCatalogsPanel
          entriesByKind={data.entriesByKind}
          documentRequirements={data.documentRequirements}
          costCodesEnabled={data.costCodesEnabled}
          defaultPaymentTermKey={data.defaultPaymentTermKey}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}
