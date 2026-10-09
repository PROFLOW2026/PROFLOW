import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { ProjectExecutionNavList, type ResolvedExecutionHubLink } from './project-execution-nav-list';

interface ProjectExecutionNavProps {
  readonly links: readonly { readonly key: string; readonly href: string }[];
  readonly dir?: 'rtl' | 'ltr';
  readonly backToProjectHref?: string;
}

/** Compact ניהול ביצוע layer. Shown only when the loader already decided this is developer_gc. */
export async function ProjectExecutionNav({ links, dir, backToProjectHref }: ProjectExecutionNavProps) {
  if (links.length === 0) return null;

  const t = await getTranslations('projectWorkspace');
  const resolved: ResolvedExecutionHubLink[] = links.map((link) => ({
    key: link.key,
    href: link.href,
    label: t(`execution.hubs.${link.key}` as never),
  }));

  return (
    <nav
      aria-label={t('execution.navAriaLabel')}
      dir={dir}
      className="min-w-0 max-w-full space-y-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 sm:p-4"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('execution.identityTitle')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('execution.identityHint')}</p>
        </div>
        {backToProjectHref ? (
          <Link
            href={backToProjectHref}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
          >
            {t('execution.backToProject')}
          </Link>
        ) : null}
      </div>
      <ProjectExecutionNavList links={resolved} />
    </nav>
  );
}
