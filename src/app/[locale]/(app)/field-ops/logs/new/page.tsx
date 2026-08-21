import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { listFieldOpsWorkPackages } from '@/modules/field-ops';
import { isStorageConfigured } from '@/modules/documents';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { listEmployeesForOrg } from '@/modules/workforce';
import { listAssetsForOrg } from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { DailyLogCreateForm } from '../daily-log-create-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('createLog.title') };
}

export default async function NewDailyLogPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const { projectId } = await searchParams;

  const { projects, workPackages, vendors, employees, assets, timezone, canManageDocuments, storageConfigured } =
    await withOrgContext(async (context) => {
      const projectRows = await listProjectsForOrg(context, {});
      const packages = await listFieldOpsWorkPackages(
        context,
        projectRows.map((p) => p.id),
      );
      const [vendorRows, employeeRows, assetRows] = await Promise.all([
        hasPermission(context, PERMISSIONS.VENDORS_READ)
          ? listVendorsForOrg(context, { status: 'active' }).catch(() => [])
          : Promise.resolve([]),
        hasPermission(context, PERMISSIONS.WORKFORCE_READ)
          ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
          : Promise.resolve([]),
        hasPermission(context, PERMISSIONS.ASSETS_READ)
          ? listAssetsForOrg(context).catch(() => [])
          : Promise.resolve([]),
      ]);
      const preferredVendors = vendorRows.filter(
        (v) => v.type === 'subcontractor' || v.type === 'both',
      );
      const vendorOptions = (preferredVendors.length > 0 ? preferredVendors : vendorRows).map(
        (v) => ({ id: v.id, name: v.name, hint: v.type }),
      );
      return {
        projects: projectRows,
        workPackages: packages,
        vendors: vendorOptions,
        employees: employeeRows.map((e) => ({
          id: e.id,
          name: e.name,
        })),
        assets: assetRows.map((a) => ({ id: a.id, name: a.name })),
        timezone: context.organization.timezone,
        canManageDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
        storageConfigured: isStorageConfigured(),
      };
    });

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('createLog.title')} />
        <EmptyState
          title={t('empty.projectsRequired.title')}
          description={t('empty.projectsRequired.body')}
          action={
            <Button asChild>
              <Link href="/projects">{t('empty.projectsRequired.action')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('createLog.title')}
        description={t('createLog.description')}
        breadcrumb={
          <Link href="/field-ops/logs" className={textNavLinkMutedClassName}>
            {t('nav.logs')}
          </Link>
        }
      />
      <DailyLogCreateForm
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        workPackages={workPackages}
        vendors={vendors}
        employees={employees}
        assets={assets}
        defaultProjectId={projectId}
        defaultLogDate={todayInTimeZone(timezone)}
        canManageDocuments={canManageDocuments}
        storageConfigured={storageConfigured}
      />
    </div>
  );
}
