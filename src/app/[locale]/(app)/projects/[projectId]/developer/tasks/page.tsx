import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listContractorPortalTasks } from '@/modules/collaboration';
import { requireConnectedDeveloperSession } from '@/modules/connected-projects';
import { portalDeveloperProjectHref } from '@/modules/connected-projects/domain/developer-workflows';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';

export default async function ConnectedDeveloperTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { projectId: contractorProjectId } = await params;
  const scope = (await searchParams).scope === 'all' ? 'all' : 'open';
  const session = await requireConnectedDeveloperSession(contractorProjectId, {
    anyOf: [EXTERNAL_CAPABILITIES.TASK_WORK, EXTERNAL_CAPABILITIES.TASK_REPORT],
  });

  const developerProjectId = session.developer.projectId;
  const organizationId = session.developer.organizationId;

  const [t, format] = await Promise.all([getTranslations('collaboration'), getFormatter()]);
  const tasks = await listContractorPortalTasks(session.externalContext, {
    organizationId,
    projectId: developerProjectId,
    openOnly: scope === 'open',
  });

  const filterBase = `/projects/${contractorProjectId}/developer/tasks`;
  const portalTaskBase = portalDeveloperProjectHref(developerProjectId, 'tasks');

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader title={t('portal.tasks.title')} description={t('portal.tasks.description')} />

      <nav className="flex gap-2" aria-label={t('portal.tasks.filterLabel')}>
        <Button asChild size="sm" variant={scope === 'open' ? 'primary' : 'secondary'}>
          <Link href={filterBase}>{t('portal.tasks.filters.open')}</Link>
        </Button>
        <Button asChild size="sm" variant={scope === 'all' ? 'primary' : 'secondary'}>
          <Link href={`${filterBase}?scope=all`}>{t('portal.tasks.filters.all')}</Link>
        </Button>
      </nav>

      {tasks.length === 0 ? (
        <EmptyState title={t('portal.tasks.emptyTitle')} description={t('portal.tasks.emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.taskId}>
              <Link href={`${portalTaskBase}/${task.taskId}`} className="block" prefetch>
                <Card className={task.overdue ? 'border-[var(--pf-status-danger-border)]' : undefined}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-medium">{task.title}</p>
                      <Badge tone={task.overdue ? 'danger' : 'neutral'}>{t(`taskStatus.${task.status}`)}</Badge>
                    </div>
                    {task.dueDate ? (
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        {t('contractorPanel.due', { date: task.dueDate })}
                      </p>
                    ) : null}
                    {task.availableCommands.length > 0 ? (
                      <span className="text-sm font-medium text-[var(--pf-text-brand)]">
                        {t('portal.tasks.actionRequired')}
                      </span>
                    ) : null}
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {format.dateTime(new Date(task.updatedAt), { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
