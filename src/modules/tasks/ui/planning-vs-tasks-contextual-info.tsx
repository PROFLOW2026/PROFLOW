'use client';

import { useTranslations } from 'next-intl';
import { ContextualInfo } from '@/components/ui/contextual-info';
import { Link } from '@/shared/i18n/navigation';

interface PlanningVsTasksContextualInfoProps {
  readonly projectId?: string;
}

export function PlanningVsTasksContextualInfo({ projectId }: PlanningVsTasksContextualInfoProps) {
  const t = useTranslations('tasks');

  return (
    <ContextualInfo
      dialogTitle={t('planningVsTasks.dialogTitle')}
      content={
        <>
          <p>{t('planningVsTasks.hint')}</p>
          <p className="pt-2">
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
        </>
      }
    />
  );
}
