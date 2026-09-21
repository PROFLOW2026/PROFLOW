import { getTranslations } from 'next-intl/server';
import { CalendarRange, FileText, GitBranch, Kanban, ListChecks, Users } from 'lucide-react';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { uwmSecondaryPanelClass, uwmSectionHeadingClass } from '@/shared/ui/uwm-surface-styles';

interface ProjectUwmLinksProps {
  projectId: string;
}

/**
 * Quick entry to project-bound UWM surfaces (tasks, boards).
 * Does not replace or modify the legacy Project "עבודה" tab.
 */
export async function ProjectUwmLinks({ projectId }: ProjectUwmLinksProps) {
  const t = await getTranslations('tasks');

  return (
    <section aria-label={t('projectWork.sectionLabel')} className={uwmSecondaryPanelClass}>
      <h2 className={uwmSectionHeadingClass}>{t('projectWork.sectionTitle')}</h2>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
        {t('projectWork.sectionDescription')}
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <Link
            href={`/projects/${projectId}/tasks`}
            className={cn(pressableCardLinkClassName, 'flex items-center gap-3 px-3 py-3')}
          >
            <ListChecks aria-hidden className="size-5 shrink-0 text-[var(--pf-text-brand)]" />
            <span className="font-medium">{t('projectWork.tasksLink')}</span>
          </Link>
        </li>
        <li>
          <Link
            href={`/projects/${projectId}/boards`}
            className={cn(pressableCardLinkClassName, 'flex items-center gap-3 px-3 py-3')}
          >
            <Kanban aria-hidden className="size-5 shrink-0 text-[var(--pf-text-brand)]" />
            <span className="font-medium">{t('projectWork.boardsLink')}</span>
          </Link>
        </li>
        <li>
          <Link
            href={`/projects/${projectId}/calendar`}
            className={cn(pressableCardLinkClassName, 'flex items-center gap-3 px-3 py-3')}
          >
            <CalendarRange aria-hidden className="size-5 shrink-0 text-[var(--pf-text-brand)]" />
            <span className="font-medium">{t('projectWork.calendarLink')}</span>
          </Link>
        </li>
        <li>
          <Link
            href={`/projects/${projectId}/timeline`}
            className={cn(pressableCardLinkClassName, 'flex items-center gap-3 px-3 py-3')}
          >
            <GitBranch aria-hidden className="size-5 shrink-0 text-[var(--pf-text-brand)]" />
            <span className="font-medium">{t('projectWork.timelineLink')}</span>
          </Link>
        </li>
        <li>
          <Link
            href={`/projects/${projectId}?tab=documents`}
            className={cn(pressableCardLinkClassName, 'flex items-center gap-3 px-3 py-3')}
          >
            <FileText aria-hidden className="size-5 shrink-0 text-[var(--pf-text-brand)]" />
            <span className="font-medium">{t('projectWork.filesLink')}</span>
          </Link>
        </li>
        <li>
          <Link
            href={`/meetings?projectId=${projectId}`}
            className={cn(pressableCardLinkClassName, 'flex items-center gap-3 px-3 py-3')}
          >
            <Users aria-hidden className="size-5 shrink-0 text-[var(--pf-text-brand)]" />
            <span className="font-medium">{t('projectWork.meetingsLink')}</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
