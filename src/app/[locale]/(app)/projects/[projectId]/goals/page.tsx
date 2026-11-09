import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectGoals } from '@/modules/project-goals';
import { ProjectGoalsPanel, type ProjectGoalListItem } from '@/modules/project-goals/ui/project-goals-panel';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { withOrgContext } from '@/shared/auth/session';
import { hasAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function ProjectGoalsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('projectGoals');

  const data = await loadOrNotFound(() =>
    withOrgContext(async (context) => {
      const goals = await listProjectGoals(context, projectId);
      const canUpdate = hasAnyPermission(context, [
        PERMISSIONS.PROJECTS_UPDATE,
        PERMISSIONS.PLANNING_WRITE,
      ]);
      const items: ProjectGoalListItem[] = goals.map((row) => ({
        id: row.id,
        title: row.title,
        dueOn: row.dueOn,
        status: row.status,
        progressPercent: row.progressPercent,
      }));
      return { items, canUpdate };
    }),
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
        />
      </MainAppSection>
    </MainAppPage>
  );
}
