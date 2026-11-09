import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectRisks } from '@/modules/project-risks';
import { ProjectRisksPanel, type ProjectRiskListItem } from '@/modules/project-risks/ui/project-risks-panel';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function ProjectRisksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('projectRisks');

  const data = await loadOrNotFound(() =>
    withOrgContext(async (context) => {
      const risks = await listProjectRisks(context, projectId);
      const canUpdate = hasPermission(context, PERMISSIONS.PROJECTS_UPDATE);
      const items: ProjectRiskListItem[] = risks.map((row) => ({
        id: row.id,
        description: row.description,
        probability: row.probability,
        impact: row.impact,
        score: row.score,
        treatment: row.treatment,
        status: row.status,
        reviewOn: row.reviewOn,
      }));
      return { items, canUpdate };
    }),
  );

  return (
    <MainAppPage>
      <PageHeader title={t('title')} description={t('description')} />
      <MainAppSection>
        <ProjectRisksPanel
          key={data.items.map((item) => `${item.id}:${item.status}`).join('|')}
          projectId={projectId}
          initialRows={data.items}
          canUpdate={data.canUpdate}
        />
      </MainAppSection>
    </MainAppPage>
  );
}
