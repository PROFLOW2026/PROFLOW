import * as React from 'react';

export function TopBar({
  organizationName,
  quickCreate,
  userMenu,
}: {
  organizationName: string;
  quickCreate?: React.ReactNode;
  userMenu: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[var(--pf-topbar-height)] shrink-0 items-center gap-3 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4">
      <span className="flex items-center gap-2 lg:hidden">
        <span className="flex size-7 items-center justify-center rounded-md bg-[var(--pf-action-primary)] text-xs font-bold text-[var(--pf-action-primary-fg)]">
          PF
        </span>
        <span className="max-w-40 truncate text-sm font-semibold">{organizationName}</span>
      </span>

      <div className="flex-1" />

      {quickCreate}
      {userMenu}
    </header>
  );
}
