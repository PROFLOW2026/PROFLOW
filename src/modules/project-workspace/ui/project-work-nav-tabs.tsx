'use client';

import { useTranslations } from 'next-intl';
import { pressableClassName } from '@/components/ui/pressable';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const PROJECT_WORK_ROUTES = [
  { segment: 'tasks', labelKey: 'tasks' as const },
  { segment: 'boards', labelKey: 'boards' as const },
  { segment: 'calendar', labelKey: 'calendar' as const },
  { segment: 'timeline', labelKey: 'timeline' as const },
] as const;

function routeIsActive(pathname: string, projectId: string, segment: string): boolean {
  const base = `/projects/${projectId}/${segment}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function ProjectWorkNavTabs({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('tasks');
  const pathname = usePathname();

  return (
    <div
      className={cn(
        'flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {PROJECT_WORK_ROUTES.map(({ segment, labelKey }) => {
        const href = `/projects/${projectId}/${segment}`;
        const selected = routeIsActive(pathname, projectId, segment);
        return (
          <Link
            key={segment}
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
