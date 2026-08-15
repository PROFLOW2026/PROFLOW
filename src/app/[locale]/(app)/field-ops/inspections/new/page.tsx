import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listFieldOpsWorkPackages, listInspectionFormTemplateOptions } from '@/modules/field-ops';
import { isStorageConfigured } from '@/modules/documents';
import { listProjectsForOrg } from '@/modules/projects';
import { listEmployeesForOrg } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { InspectionCreateForm } from '../inspection-create-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('createInspection.title') };
}

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('fieldOps');
  const { projectId } = await searchParams;

  const { projects, workPackages, employees, formTemplates, canManageDocuments, storageConfigured } =
    await withOrgContext(async (context) => {
      const projectRows = await listProjectsForOrg(context, {});
      const packages = await listFieldOpsWorkPackages(
        context,
        projectRows.map((p) => p.id),
      );
      const [employeeRows, templates] = await Promise.all([
        listEmployeesForOrg(context, { status: 'active' }).catch(() => []),
        listInspectionFormTemplateOptions(context).catch(() => []),
      ]);
      return {
        projects: projectRows,
        workPackages: packages,
        employees: employeeRows.map((row) => ({ id: row.id, name: row.name })),
        formTemplates: templates,
        canManageDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
        storageConfigured: isStorageConfigured(),
      };
    });

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('createInspection.title')} />
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
        title={t('createInspection.title')}
        description={t('createInspection.description')}
        breadcrumb={
          <Link
            href="/field-ops/inspections"
            className={textNavLinkMutedClassName}
          >
            {t('nav.inspections')}
          </Link>
        }
      />
      <InspectionCreateForm
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        workPackages={workPackages}
        employees={employees}
        formTemplates={formTemplates}
        defaultProjectId={projectId}
        canManageDocuments={canManageDocuments}
        storageConfigured={storageConfigured}
      />
    </div>
  );
}
