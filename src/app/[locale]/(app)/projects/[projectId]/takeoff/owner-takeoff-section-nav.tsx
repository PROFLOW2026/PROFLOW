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
      className="flex min-w-0 max-w-full"
    >
      <ul className="flex min-w-0">
        <li>
          <Link
            href={listHref}
            className="inline-flex min-h-9 items-center text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
          >
            {tLinks('takeoff')}
          </Link>
        </li>
      </ul>
    </nav>
  );
}