import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listClientsForOrg } from '@/modules/clients';
import { listProjectsForOrg } from '@/modules/projects';
import {
  listCustomerGrants,
  listVendorGrants,
  listVendorPortalCandidatesForOrg,
} from '@/modules/portal';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { PortalGrantsPanel } from './portal-panel';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('portal');
}

export default async function PortalSettingsPage() {
  const t = await getTranslations('portal');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'portal')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const [customerGrants, vendorGrants, clients, projects, vendors, candidates] =
      await Promise.all([
        listCustomerGrants(context),
        listVendorGrants(context),
        listClientsForOrg(context, {}).catch(() => []),
        listProjectsForOrg(context, {}).catch(() => []),
        listVendorsForOrg(context, {}).catch(() => []),
        canManageSection(context, 'portal')
          ? listVendorPortalCandidatesForOrg(context).catch(() => ({
              apBillCandidates: [],
              complianceCandidates: [],
            }))
          : Promise.resolve({ apBillCandidates: [], complianceCandidates: [] }),
      ]);

    return {
      allowed: true as const,
      customerGrants,
      vendorGrants,
      clients: clients.map((client) => ({ id: client.id, name: client.name })),
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      vendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
      apBillCandidates: candidates.apBillCandidates,
      complianceCandidates: candidates.complianceCandidates,
      canEdit: canManageSection(context, 'portal'),
      canRecordQuote: hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE),
      defaultCurrency: context.organization.baseCurrency,
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
      <Card className="min-w-0 p-4 sm:p-5">
        <PortalGrantsPanel
          customerGrants={data.customerGrants}
          vendorGrants={data.vendorGrants}
          clients={data.clients}
          projects={data.projects}
          vendors={data.vendors}
          apBillCandidates={data.apBillCandidates}
          complianceCandidates={data.complianceCandidates}
          canEdit={data.canEdit}
          canRecordQuote={data.canRecordQuote}
          defaultCurrency={data.defaultCurrency}
        />
      </Card>
    </SettingsPageShell>
  );
}
