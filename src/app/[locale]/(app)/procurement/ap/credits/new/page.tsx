import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { listApBillsForOrg } from '@/modules/ap';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { VendorCreditCreateForm } from './credit-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('credits.createPage.title') };
}

export default async function NewVendorCreditPage() {
  const t = await getTranslations('ap');

  const { vendors, projects, bills, defaultCurrency, canManage, orgToday } = await withOrgContext(
    async (context) => {
      const canReadVendors = hasPermission(context, PERMISSIONS.VENDORS_READ);
      const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
      const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);

      const [vendorRows, projectRows, billRows] = await Promise.all([
        canReadVendors ? listVendorsForOrg(context, { status: 'active' }) : Promise.resolve([]),
        canReadProjects ? listProjectsForOrg(context, { status: 'active' }) : Promise.resolve([]),
        canReadAp ? listApBillsForOrg(context) : Promise.resolve([]),
      ]);

      return {
        vendors: vendorRows.map((vendor) => ({ id: vendor.id, name: vendor.name })),
        projects: projectRows.map((project) => ({ id: project.id, name: project.name })),
        bills: billRows.map((bill) => ({
          id: bill.id,
          vendorId: bill.vendorId,
          reference: bill.reference,
          status: bill.status,
        })),
        defaultCurrency: context.organization.baseCurrency,
        canManage: hasPermission(context, PERMISSIONS.AP_MANAGE),
        orgToday: todayInTimeZone(context.organization.timezone),
      };
    },
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('credits.createPage.title')}
        description={t('credits.createPage.description')}
        breadcrumb={
          <Link href="/procurement/ap/credits" className={textNavLinkMutedClassName}>
            {t('credits.listTitle')}
          </Link>
        }
      />

      {!canManage ? (
        <EmptyState title={t('empty.noAccess.title')} description={t('empty.noAccess.body')} />
      ) : vendors.length === 0 ? (
        <EmptyState
          title={t('empty.vendorsRequired.title')}
          description={t('empty.vendorsRequired.body')}
          action={
            <Button asChild>
              <Link href="/vendors/new">{t('empty.vendorsRequired.action')}</Link>
            </Button>
          }
        />
      ) : (
        <VendorCreditCreateForm
          defaultCurrency={defaultCurrency}
          defaultCreditDate={orgToday}
          vendors={vendors}
          projects={projects}
          bills={bills}
        />
      )}
    </div>
  );
}
