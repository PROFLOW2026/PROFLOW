import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectStructureScreen } from '@/modules/project-profile/ui/project-structure-screen';
import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';

export default async function EmployeeProjectStructurePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('projectProfile');
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <ProjectStructureScreen projectId={projectId} basePath={`/employee/projects/${projectId}/structure`} />
    </div>
  );
}
