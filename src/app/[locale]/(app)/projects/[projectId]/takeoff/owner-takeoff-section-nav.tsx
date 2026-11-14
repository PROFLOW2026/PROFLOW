import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

interface OwnerTakeoffSectionNavProps {
  readonly projectId: string;
  readonly dir: 'rtl' | 'ltr';
}

/** Single-section nav for owner takeoff workspace (list entry; workspace routes stay under same chrome). */
export async function OwnerTakeoffSectionNav({ projectId, dir }: OwnerTakeoffSectionNavProps) {
  const tNav = await getTranslations('projectWorkspace.takeoff');
  const tLinks = await getTranslations('projects.workspace.links');
  const listHref = `/projects/${projectId}/takeoff`;

  return (
    <nav
      aria-label={tNav('navAriaLabel')}
      dir={dir}
      className="min-w-0 max-w-full rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-2 sm:p-3"
    >
      <ul className="flex min-w-0 flex-wrap gap-2">
        <li>
          <Link
            href={listHref}
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm font-medium text-[var(--pf-text-brand)] shadow-[var(--pf-shadow-sm)] hover:bg-[var(--pf-action-subtle-hover)]"
          >
            {tLinks('takeoff')}
          </Link>
        </li>
      </ul>
    </nav>
  );
}