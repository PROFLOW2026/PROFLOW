import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ChangeRequestForm } from '@/modules/commercial/ui/change-request-form';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { createChangeRequestAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('changes');
  return { title: t('form.createTitle') };
}

export default async function NewChangePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('changes');
  const { projectId } = await searchParams;

  const projects = await withOrgContext((context) =>
    listProjectsForOrg(context, { status: 'active' }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('form.createTitle')} description={t('form.createDescription')} />
      <ChangeRequestForm
        action={createChangeRequestAction}
        projectId={projectId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      />
    </div>
  );
}
