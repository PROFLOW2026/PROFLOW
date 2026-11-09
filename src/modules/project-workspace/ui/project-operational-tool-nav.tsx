import { getTranslations } from 'next-intl/server';
import type { ProjectOperationalToolLink } from '../domain/project-operational-tool-links';
import { ProjectOperationalToolNavList } from './project-operational-tool-nav-list';

export async function ProjectOperationalToolNav({
  links,
  dir,
}: {
  readonly links: readonly ProjectOperationalToolLink[];
  readonly dir?: 'rtl' | 'ltr';
}) {
  if (links.length === 0) return null;

  const t = await getTranslations('projectWorkspace');
  const resolved = links.map((link) => ({
    id: link.id,
    href: link.href,
    label: t(`execution.hubLinks.${link.labelKey}` as never),
  }));

  return (
    <nav aria-label={t('execution.operationalToolsAriaLabel')} dir={dir} className="min-w-0 max-w-full">
      <ProjectOperationalToolNavList links={resolved} />
    </nav>
  );
}
