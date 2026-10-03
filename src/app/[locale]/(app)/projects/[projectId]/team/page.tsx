import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES, loadProjectTeamPage } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectTeamScreen } from '@/modules/project-team/ui/project-team-screen';
import { withOrgContext } from '@/shared/auth/session';

export async function generateMetadata() {
  const t = await getTranslations('projectTeam');
  return { title: t('page.title') };
}

export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const [t, data] = await Promise.all([
    getTranslations('projectTeam'),
    withOrgContext((context) => loadProjectTeamPage(context, projectId)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <ProjectTeamScreen data={data} />
    </div>
  );
}
