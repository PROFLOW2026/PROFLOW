import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { listBusinessCatalog, localizePaymentTermOptions } from '@/modules/business-catalog';
import { listPurchaseOrderLinesForOrg, listPurchaseOrdersForOrg } from '@/modules/procurement';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ApBillCreateForm } from './ap-bill-create-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('create.title') };
}

export default async function NewApBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const t = await getTranslations('ap');
  const search = await searchParams;
  const requestedPoId = typeof search.purchaseOrderId === 'string' ? search.purchaseOrderId : '';

  const { vendors, projects, purchaseOrders, poLinesByPoId, paymentTerms, defaultCurrency, canManage } =
    await withOrgContext(async (context) => {
      const canReadVendors = hasPermission(context, PERMISSIONS.VENDORS_READ);
      const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
      const canReadPo = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
      const canReadCatalog = hasPermission(context, PERMISSIONS.ORG_READ);

      const [vendorRows, projectRows, poRows, termRows] = await Promise.all([
        canReadVendors ? listVendorsForOrg(context, { status: 'active' }) : Promise.resolve([]),
        canReadProjects ? listProjectsForOrg(context, { status: 'active' }) : Promise.resolve([]),
        canReadPo ? listPurchaseOrdersForOrg(context) : Promise.resolve([]),
        canReadCatalog
          ? listBusinessCatalog(context, 'payment_term').catch(() => [])
          : Promise.resolve([]),
      ]);

      const lineEntries = canReadPo
        ? await Promise.all(
            poRows.map(async (po) => {
              const lines = await listPurchaseOrderLinesForOrg(context, po.id);
              return [
                po.id,
                lines.map((line) => ({
                  id: line.id,
                  description: line.description,
                  lineTotal: line.lineTotal,
                  currency: line.currency,
                })),
              ] as const;
            }),
          )
        : [];

      return {
        vendors: vendorRows.map((vendor) => ({
          id: vendor.id,
          name: vendor.name,
          defaultPaymentTermId: vendor.defaultPaymentTermId ?? null,
        })),
        projects: projectRows.map((project) => ({ id: project.id, name: project.name })),
        purchaseOrders: poRows.map((po) => ({
          id: po.id,
          reference: po.reference,
          vendorId: po.vendorId,
        })),
        poLinesByPoId: Object.fromEntries(lineEntries) as Record<
          string,
          { id: string; description: string; lineTotal: string; currency: string }[]
        >,
        paymentTerms: localizePaymentTermOptions(termRows, locale),
        defaultCurrency: context.organization.baseCurrency,
        canManage: hasPermission(context, PERMISSIONS.AP_MANAGE),
      };
    });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Link
            href="/procurement/ap"
            className={textNavLinkMutedClassName}
          >
            {t('title')}
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
        <ApBillCreateForm
          defaultCurrency={defaultCurrency}
          vendors={vendors}
          projects={projects}
          purchaseOrders={purchaseOrders}
          poLinesByPoId={poLinesByPoId}
          paymentTerms={paymentTerms}
          defaultPurchaseOrderId={requestedPoId}
        />
      )}
    </div>
  );
}
