import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { loadInternalProjectGoalsPanelData } from '@/modules/project-goals';
import { ProjectGoalsPanel } from '@/modules/project-goals/ui/project-goals-panel';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { withOrgContext } from '@/shared/auth/session';

export default async function ProjectGoalsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('projectGoals');

  const data = await loadOrNotFound(() =>
    withOrgContext((context) => loadInternalProjectGoalsPanelData(context, projectId)),
  );

  return (
    <MainAppPage>
      <PageHeader title={t('title')} description={t('description')} />
      <MainAppSection>
        <ProjectGoalsPanel
          key={data.items.map((item) => `${item.id}:${item.status}`).join('|')}
          projectId={projectId}
          initialRows={data.items}
          canUpdate={data.canUpdate}
          viewOnly={data.viewOnly}
        />
      </MainAppSection>
    </MainAppPage>
  );
}
