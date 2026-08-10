import { getTranslations } from 'next-intl/server';
import type { ProjectWorkspaceLink } from '@/modules/projects';
import { SectionNavLink } from '@/components/ui/section-nav-link';

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
            <SectionNavLink
              href={link.href}
              className="border border-[var(--pf-border-default)]"
            >
              {t(link.key)}
            </SectionNavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
