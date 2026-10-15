import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

interface PlanningVsTasksHintProps {
  /** When set, links to project schedule tab and project tasks list. */
  readonly projectId?: string;
}

export async function PlanningVsTasksHint({ projectId }: PlanningVsTasksHintProps) {
  const t = await getTranslations('tasks');

  return (
    <p className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] px-3 py-2 text-sm text-[var(--pf-text-secondary)]">
      {t('planningVsTasks.hint')}{' '}
      {projectId ? (
        <>
          <Link
            href={`/projects/${projectId}?tab=schedule`}
            className="font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
          >
            {t('planningVsTasks.openPlanning')}
          </Link>
          {' · '}
          <Link
            href={`/projects/${projectId}/tasks`}
            className="font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
          >
            {t('planningVsTasks.openTasks')}
          </Link>
        </>
      ) : (
        <Link
          href="/work/list"
          className="font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
        >
          {t('planningVsTasks.openTaskList')}
        </Link>
      )}
    </p>
  );
}
