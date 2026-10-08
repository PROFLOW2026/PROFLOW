import { getTranslations } from 'next-intl/server';
import { ProjectExecutionNavList, type ResolvedExecutionHubLink } from './project-execution-nav-list';

interface ProjectExecutionNavProps {
  readonly links: readonly { readonly key: string; readonly href: string }[];
  readonly dir?: 'rtl' | 'ltr';
}

/** Compact ניהול ביצוע layer. Shown only when the loader already decided this is developer_gc. */
export async function ProjectExecutionNav({ links, dir }: ProjectExecutionNavProps) {
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
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('execution.identityTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('execution.identityHint')}</p>
      </div>
      <ProjectExecutionNavList links={resolved} />
    </nav>
  );
}
