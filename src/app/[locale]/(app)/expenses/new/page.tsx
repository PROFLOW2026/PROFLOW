import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { listCostCategoriesForOrg, listProjectsForOrg, listWorkPackagesForOrg } from '@/modules/expenses';
import { listVendorsForOrg } from '@/modules/vendors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getShellContext } from '@/shared/auth/session';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { ExpenseCaptureForm } from './expense-capture-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('capture.title') };
}

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('expenses');
  const tCommon = await getTranslations('common');
  const shell = await getShellContext();
  const params = await searchParams;
  const preselectedProjectId = typeof params.projectId === 'string' ? params.projectId : undefined;

  const [projects, categories, workPackages, vendors] = await withOrgContext(async (context) => {
    const projectRows = await listProjectsForOrg(context);
    const categoryRows = await listCostCategoriesForOrg(context);
    const packages = preselectedProjectId
      ? await listWorkPackagesForOrg(context, preselectedProjectId)
      : [];
    const vendorRows = hasPermission(context, PERMISSIONS.VENDORS_READ)
      ? await listVendorsForOrg(context, { status: 'active' }).catch(() => [])
      : [];
    return [projectRows, categoryRows, packages, vendorRows] as const;
  });

  const defaultCurrency = shell?.organization.baseCurrency ?? 'ILS';

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-lg flex-col gap-6">
      <PageHeader
        title={t('capture.title')}
        description={t('capture.subtitle')}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/expenses">{tCommon('actions.cancel')}</Link>
          </Button>
        }
      />

      <ExpenseCaptureForm
        defaultCurrency={defaultCurrency}
        projects={projects}
        categories={categories}
        workPackages={workPackages}
        vendors={vendors.map((vendor) => ({ id: vendor.id, name: vendor.name }))}
        initialProjectId={preselectedProjectId}
      />
    </div>
  );
}
