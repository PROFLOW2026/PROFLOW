import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { textNavLinkClassName } from '@/components/ui/pressable';

export async function TaskDetailHubNav({
  taskId,
  projectId,
  projectName,
  reportedHours,
}: {
  taskId: string;
  projectId: string | null;
  projectName: string | null;
  reportedHours: string | null | undefined;
}) {
  const t = await getTranslations('tasks');

  return (
    <nav
      aria-label={t('detailHub.navLabel')}
      className="flex min-w-0 max-w-full flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--pf-text-secondary)]"
    >
      {projectId && projectName ? (
        <Link href={`/projects/${projectId}`} className={cn(textNavLinkClassName, 'font-medium')}>
          {t('detailHub.project')}: {projectName}
        </Link>
      ) : null}
      {reportedHours != null && reportedHours !== '' ? (
        <span>
          {t('detailHub.reportedHours')}:{' '}
          <span className="font-medium text-[var(--pf-text-primary)]">{reportedHours}</span>
        </span>
      ) : null}
      <Link href={`/tasks/${taskId}#comments`} className={textNavLinkClassName}>
        {t('detailHub.jumpComments')}
      </Link>
      <Link href={`/tasks/${taskId}#activity`} className={textNavLinkClassName}>
        {t('detailHub.jumpActivity')}
      </Link>
    </nav>
  );
}
