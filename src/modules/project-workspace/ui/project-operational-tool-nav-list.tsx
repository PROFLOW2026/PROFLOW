'use client';

import { pressableClassName } from '@/components/ui/pressable';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface ResolvedProjectOperationalToolLink {
  readonly id: string;
  readonly href: string;
  readonly label: string;
}

function toolIsActive(pathname: string, href: string): boolean {
  const pathOnly = href.split('?')[0] ?? href;
  if (pathname === href || pathname.startsWith(`${href}&`)) return true;
  if (pathname === pathOnly || pathname.startsWith(`${pathOnly}/`)) return true;
  if (href.includes('?projectId=') && pathname.startsWith(pathOnly)) {
    const params = new URLSearchParams(href.split('?')[1] ?? '');
    const projectId = params.get('projectId');
    if (projectId && pathname.includes(projectId)) return true;
  }
  return false;
}

export function ProjectOperationalToolNavList({
  links,
}: {
  readonly links: readonly ResolvedProjectOperationalToolLink[];
}) {
  const pathname = usePathname();

  return (
    <div
      data-pf-slot="operational-tools-list"
      className={cn(
        'flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain pt-2',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {links.map((link) => {
        const selected = toolIsActive(pathname, link.href);
        return (
          <Link
            key={link.id}
            href={link.href}
            scroll={false}
            prefetch={false}
            data-pf-slot="operational-tool"
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium',
              'min-h-11',
              pressableClassName,
              selected
                ? 'border-[var(--pf-action-primary)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-brand)]'
                : 'border-transparent text-[var(--pf-text-secondary)] hover:border-[var(--pf-border-default)] hover:bg-[var(--pf-bg-surface)] hover:text-[var(--pf-text-primary)]',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
