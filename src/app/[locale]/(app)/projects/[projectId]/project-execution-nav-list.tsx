'use client';

import { SectionNavLink } from '@/components/ui/section-nav-link';
import { usePathname } from '@/shared/i18n/navigation';
import {
  groupExecutionNavLinks,
  type ExecutionNavGroupId,
} from '@/modules/project-workspace/domain/execution-nav-groups';
import type { ExecutionNavLinkKey } from '@/modules/project-workspace/domain/execution-route-catalog';

export interface ResolvedExecutionNavLink {
  readonly key: ExecutionNavLinkKey;
  readonly href: string;
  readonly label: string;
}

export function ProjectExecutionNavList({
  links,
  groupLabels,
}: {
  readonly links: readonly ResolvedExecutionNavLink[];
  readonly groupLabels: Readonly<Record<ExecutionNavGroupId, string>>;
}) {
  const pathname = usePathname();
  const groups = groupExecutionNavLinks(links);

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <section key={group.id} className="min-w-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {groupLabels[group.id]}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {group.links.map((link) => {
              const pathOnly = link.href.split('?')[0] ?? link.href;
              const active =
                !link.href.includes('?') &&
                (pathname === pathOnly || pathname.startsWith(`${pathOnly}/`));
              return (
                <SectionNavLink key={link.key} href={link.href} active={active} prefetch={false}>
                  {link.label}
                </SectionNavLink>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
