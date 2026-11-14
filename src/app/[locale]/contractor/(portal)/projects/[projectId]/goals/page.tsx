import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorVisibleProjectGoals } from '@/modules/project-goals';
import { ProjectGoalsPanel, type ProjectGoalListItem } from '@/modules/project-goals/ui/project-goals-panel';
import { resolveProjectGoalsCapabilities } from '@/modules/project-goals/domain/permissions';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { AuthorizationError } from '@/shared/errors';

/**
 * Contractor goals surface (BUG-015).
 * Route requires a project-covering `ext.project.view` grant for discovery only.
 * Data comes from `listContractorVisibleProjectGoals` — never a full-table dump via
 * generic project.view (intentional no-leak; see parity matrix).
 */
export default async function ContractorProjectGoalsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const covered = context.grants.some(
    (grant) =>
      grant.capabilities.has(EXTERNAL_CAPABILITIES.PROJECT_VIEW) &&
      (grant.projectId === null || grant.projectId === projectId),
  );
  if (!covered) notFound();

  const caps = resolveProjectGoalsCapabilities({
    actorKind: 'external',
    canAccessProject: true,
    canMutateGoals: false,
    hasContractorVisibleGoals: false,
  });
  if (!caps.canView) notFound();

  let items: ProjectGoalListItem[] = [];
  try {
    const goals = await listContractorVisibleProjectGoals(context, projectId);
    items = goals.map((row) => ({
      id: row.id,
      title: row.title,
      dueOn: row.dueOn,
      status: row.status,
      progressPercent: row.progressPercent,
    }));
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  const t = await getTranslations('projectGoals');

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('title')}</h1>
        <p className={portalPageSubtitleClass}>{t('contractor.description')}</p>
      </header>
      <ProjectGoalsPanel
        projectId={projectId}
        initialRows={items}
        canUpdate={false}
        viewOnly
        emptyMessageKey="list.emptyContractor"
      />
    </div>
  );
}
