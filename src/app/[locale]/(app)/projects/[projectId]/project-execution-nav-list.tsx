'use client';

import { SectionNavLink } from '@/components/ui/section-nav-link';
import { usePathname } from '@/shared/i18n/navigation';
import type { ExecutionNavLinkKey } from '@/modules/project-workspace';

export interface ResolvedExecutionNavLink {
  readonly key: ExecutionNavLinkKey;
  readonly href: string;
  readonly label: string;
}

export function ProjectExecutionNavList({ links }: { readonly links: readonly ResolvedExecutionNavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-[var(--pf-border-default)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <SectionNavLink key={link.key} href={link.href} active={active} prefetch={false}>
            {link.label}
          </SectionNavLink>
        );
      })}
    </div>
  );
}
