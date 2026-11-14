import { getTranslations } from 'next-intl/server';
import { loadInternalProjectGoalsPanelData } from '@/modules/project-goals';
import { ProjectGoalsPanel } from '@/modules/project-goals/ui/project-goals-panel';
import {
  employeePageStackClass,
  employeePageSubtitleClass,
  employeePageTitleClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { withOrgContext } from '@/shared/auth/session';

/**
 * Employee surface for project goals (BUG-015).
 * Same shared panel + permission resolver as main — view via project.view,
 * edit via projects.update | planning.write (BUG-009). Not gated by employeeApp alone.
 */
export default async function EmployeeProjectGoalsPage({
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
    <div className={employeePageStackClass}>
      <header className="space-y-1 border-b border-[var(--pf-border-default)] pb-4">
        <h1 className={employeePageTitleClass}>{t('title')}</h1>
        <p className={employeePageSubtitleClass}>{t('description')}</p>
      </header>
      <ProjectGoalsPanel
        key={data.items.map((item) => `${item.id}:${item.status}`).join('|')}
        projectId={projectId}
        initialRows={data.items}
        canUpdate={data.canUpdate}
        viewOnly={data.viewOnly}
      />
    </div>
  );
}
