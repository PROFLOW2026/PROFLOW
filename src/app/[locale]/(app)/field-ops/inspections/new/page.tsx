import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listFieldOpsWorkPackages } from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
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

  const { projects, workPackages } = await withOrgContext(async (context) => {
    const projectRows = await listProjectsForOrg(context, {});
    const packages = await listFieldOpsWorkPackages(
      context,
      projectRows.map((p) => p.id),
    );
    return { projects: projectRows, workPackages: packages };
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
        defaultProjectId={projectId}
      />
    </div>
  );
}
