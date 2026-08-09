import { getTranslations } from 'next-intl/server';
import type { ProjectWorkspaceLink } from '@/modules/projects';
import { Link } from '@/shared/i18n/navigation';

interface ProjectWorkspaceNavProps {
  links: readonly ProjectWorkspaceLink[];
}

/** Progressive overview shortcuts tying commercial, ops, and support areas. */
export async function ProjectWorkspaceNav({ links }: ProjectWorkspaceNavProps) {
  const t = await getTranslations('projects.workspace.links');

  if (links.length <= 2) return null;

  return (
    <nav
      aria-label={t('navLabel')}
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href}
              className="inline-flex rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm hover:bg-[var(--pf-bg-muted)]"
            >
              {t(link.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
