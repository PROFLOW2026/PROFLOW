import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { ProjectWorkNavTabs } from './project-work-nav-tabs';

interface ProjectWorkNavProps {
  readonly projectId: string;
  readonly dir?: 'rtl' | 'ltr';
  readonly backToProjectHref?: string;
}

/** Compact ניהול משימות layer for project-scoped task routes. */
export async function ProjectWorkNav({ projectId, dir, backToProjectHref }: ProjectWorkNavProps) {
  const t = await getTranslations('tasks');

  return (
    <nav
      aria-label={t('projectWork.navAriaLabel')}
      dir={dir}
      className="min-w-0 max-w-full space-y-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 sm:p-4"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('projectWork.identityTitle')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('projectWork.identityHint')}</p>
        </div>
        {backToProjectHref ? (
          <Link
            href={backToProjectHref}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
          >
            {t('projectWork.backToProject')}
          </Link>
        ) : null}
      </div>
      <ProjectWorkNavTabs projectId={projectId} />
    </nav>
  );
}
