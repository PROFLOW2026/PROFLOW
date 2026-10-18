import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { listContractorPortalTasks } from '@/modules/collaboration';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalItemCardClass,
  portalItemCardDangerClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalSegmentBarClass,
  portalSegmentClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export default async function ContractorTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { projectId } = await params;
  const scope = (await searchParams).scope === 'all' ? 'all' : 'open';
  const [t, format] = await Promise.all([getTranslations('collaboration'), getFormatter()]);
  const context = await requireExternalContext();
  const organizationId = context.grants.find((g) => g.projectId === projectId || g.projectId === null)?.organizationId;
  if (!organizationId) {
    return (
      <EmptyState title={t('portal.tasks.emptyTitle')} description={t('portal.tasks.emptyDescription')} />
    );
  }

  const tasks = await loadOrNotFound(() =>
    listContractorPortalTasks(context, {
      organizationId,
      projectId,
      openOnly: scope === 'open',
    }),
  );

  const basePath = `/contractor/projects/${projectId}/tasks`;

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('portal.tasks.title')}</h1>
        <p className={portalPageSubtitleClass}>{t('portal.tasks.description')}</p>
      </header>

      <nav className={portalSegmentBarClass} aria-label={t('portal.tasks.filterLabel')}>
        <Link href={basePath} className={portalSegmentClass(scope === 'open')} aria-current={scope === 'open' ? 'page' : undefined}>
          {t('portal.tasks.filters.open')}
        </Link>
        <Link href={`${basePath}?scope=all`} className={portalSegmentClass(scope === 'all')} aria-current={scope === 'all' ? 'page' : undefined}>
          {t('portal.tasks.filters.all')}
        </Link>
      </nav>

      {tasks.length === 0 ? (
        <EmptyState title={t('portal.tasks.emptyTitle')} description={t('portal.tasks.emptyDescription')} />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:gap-3">
          {tasks.map((task) => (
            <li key={task.taskId}>
              <Link
                href={`${basePath}/${task.taskId}`}
                className={cn(
                  portalItemCardClass,
                  'block transition-colors hover:bg-[var(--pf-teal-50)]/30',
                  task.overdue ? portalItemCardDangerClass : null,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold text-[var(--pf-text-primary)]">{task.title}</p>
                  <Badge tone={task.overdue ? 'danger' : 'neutral'}>{t(`taskStatus.${task.status}`)}</Badge>
                </div>
                {task.dueDate ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {t('contractorPanel.due', { date: task.dueDate })}
                  </p>
                ) : null}
                {task.availableCommands.length > 0 ? (
                  <span className="text-sm font-medium text-[var(--pf-accent)]">
                    {t('portal.tasks.actionRequired')}
                  </span>
                ) : null}
                <p className="text-xs text-[var(--pf-text-muted)]">
                  {format.dateTime(new Date(task.updatedAt), { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
