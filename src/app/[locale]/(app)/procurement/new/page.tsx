import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { listMaterialsForOrg } from '@/modules/procurement';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PurchaseOrderCreateForm } from './po-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('create.title') };
}

export default async function NewPurchaseOrderPage() {
  const t = await getTranslations('procurement');

  const { vendors, projects, materials, defaultCurrency, canManage } = await withOrgContext(
    async (context) => {
      const canReadVendors = hasPermission(context, PERMISSIONS.VENDORS_READ);
      const canReadProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
      const canReadMaterials = hasPermission(context, PERMISSIONS.MATERIALS_READ);

      const [vendorRows, projectRows, materialRows] = await Promise.all([
        canReadVendors ? listVendorsForOrg(context, { status: 'active' }) : Promise.resolve([]),
        canReadProjects ? listProjectsForOrg(context, { status: 'active' }) : Promise.resolve([]),
        canReadMaterials ? listMaterialsForOrg(context) : Promise.resolve([]),
      ]);

      return {
        vendors: vendorRows.map((vendor) => ({ id: vendor.id, name: vendor.name })),
        projects: projectRows.map((project) => ({ id: project.id, name: project.name })),
        materials: materialRows.map((item) => ({
          id: item.id,
          name: item.name,
          defaultUnitPrice: item.defaultUnitPrice,
          currency: item.currency,
        })),
        defaultCurrency: context.organization.baseCurrency,
        canManage: hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE),
      };
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Link href="/procurement" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/procurement/materials">{t('linkMaterials')}</Link>
          </Button>
        }
      />

      {!canManage ? null : vendors.length === 0 ? (
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
        <PurchaseOrderCreateForm
          defaultCurrency={defaultCurrency}
          vendors={vendors}
          projects={projects}
          materials={materials}
        />
      )}
    </div>
  );
}
