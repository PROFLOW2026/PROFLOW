'use client';

import { SectionNavLink } from '@/components/ui/section-nav-link';
import { usePathname } from '@/shared/i18n/navigation';

export interface ResolvedExecutionHubLink {
  readonly key: string;
  readonly href: string;
  readonly label: string;
}

function hubIsCurrent(pathname: string, href: string): boolean {
  const pathOnly = href.split('?')[0] ?? href;
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

/** Compact wrap of the seven Developer / GC hubs. Active match requires a path boundary. */
export function ProjectExecutionNavList({
  links,
}: {
  readonly links: readonly ResolvedExecutionHubLink[];
}) {
  const pathname = usePathname();

  return (
    <ul className="flex min-w-0 flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.key} className="min-w-0">
          <SectionNavLink href={link.href} active={hubIsCurrent(pathname, link.href)} prefetch={false}>
            {link.label}
          </SectionNavLink>
        </li>
      ))}
    </ul>
  );
}
