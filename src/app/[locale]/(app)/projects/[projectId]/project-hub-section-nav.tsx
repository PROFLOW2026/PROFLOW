import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableClassName } from '@/components/ui/pressable';
import type { ProjectTabKey } from './project-tab-order';
import type { ProjectHubKey } from './project-hub-order';
import { ProjectExperienceHiddenTabsControl } from './project-experience-hidden-tabs-control';

interface ProjectHubSectionNavProps {
  readonly hub: ProjectHubKey;
  readonly sections: readonly ProjectTabKey[];
  readonly activeSection: ProjectTabKey;
  readonly projectHref: string;
  readonly dir?: 'rtl' | 'ltr';
  readonly experienceHiddenCount?: number;
  readonly experienceShowHidden?: boolean;
}

function sectionHref(projectHref: string, section: ProjectTabKey): string {
  if (section === 'overview') return projectHref;
  return `${projectHref}?tab=${section}`;
}

/**
 * Inner sub-navigation within a project hub (money / work / details).
 */
export async function ProjectHubSectionNav({
  hub,
  sections,
  activeSection,
  projectHref,
  dir,
  experienceHiddenCount = 0,
  experienceShowHidden = false,
}: ProjectHubSectionNavProps) {
  if (sections.length <= 1 && experienceHiddenCount <= 0) return null;

  const t = await getTranslations('projects.workspace');
  const tTabs = await getTranslations('projects.workspace.tabs');

  return (
    <nav
      aria-label={hub}
      dir={dir}
      className="flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-[var(--pf-border-default)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((section) => {
        const selected = section === activeSection;
        return (
          <Link
            key={section}
            href={sectionHref(projectHref, section)}
            scroll={false}
            prefetch={false}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm',
              pressableClassName,
              selected
                ? 'bg-[var(--pf-action-subtle-active)] font-medium text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
            )}
          >
            {tTabs(section)}
          </Link>
        );
      })}
      <ProjectExperienceHiddenTabsControl
        hiddenCount={experienceHiddenCount}
        showHidden={experienceShowHidden}
        showLabel={t('experienceShowHiddenTabs', { count: experienceHiddenCount })}
        hideLabel={t('experienceHideOptionalTabs')}
      />
    </nav>
  );
}
