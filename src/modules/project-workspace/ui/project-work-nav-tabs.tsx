'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { pressableClassName } from '@/components/ui/pressable';
import {
  projectWorkNavHref,
  projectWorkNavLinksForSurface,
  projectWorkNavSegmentForActiveCheck,
} from '@/modules/project-workspace/domain/project-work-nav-links';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

function segmentIsActive(pathname: string, projectRoot: string, segment: string): boolean {
  const base = `${projectRoot}/${segment}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function ProjectWorkNavTabs({
  projectId,
  surfaceRoot,
}: {
  readonly projectId: string;
  /** e.g. `/projects/{id}` or `/employee/projects/{id}` */
  readonly surfaceRoot?: string;
}) {
  const projectRoot = surfaceRoot ?? `/projects/${projectId}`;
  const t = useTranslations('tasks');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const onProjectRoot = pathname === projectRoot || pathname === `${projectRoot}/`;

  const links = projectWorkNavLinksForSurface(projectRoot);

  return (
    <div
      className={cn(
        'flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {links.map((link) => {
        const labelKey = link.labelKey;
        const href = projectWorkNavHref(projectRoot, link);
        let selected = false;

        if (link.kind === 'documentsTab' && !projectRoot.startsWith('/employee/')) {
          selected = onProjectRoot && tab === 'documents';
        } else {
          const segment = projectWorkNavSegmentForActiveCheck(projectRoot, link);
          if (segment) {
            selected = segmentIsActive(pathname, projectRoot, segment);
          }
        }

        return (
          <Link
            key={labelKey}
            href={href}
            scroll={false}
            prefetch={false}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium',
              'min-h-11',
              pressableClassName,
              selected
                ? 'border-[var(--pf-action-primary)] text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
            )}
          >
            {t(`projectWork.nav.${labelKey}`)}
          </Link>
        );
      })}
    </div>
  );
}
