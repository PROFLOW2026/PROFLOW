import * as React from 'react';
import { ConnectivityIndicator } from '@/modules/offline/ui/connectivity-banner';

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
    <header className="sticky top-0 z-20 flex h-[var(--pf-topbar-height)] w-full min-w-0 shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 sm:gap-3">
      <span className="flex min-w-0 items-center gap-2 lg:hidden">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pf-action-primary)] text-xs font-bold text-[var(--pf-action-primary-fg)]">
          PF
        </span>
        <span className="max-w-40 truncate text-sm font-semibold">{organizationName}</span>
      </span>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        <ConnectivityIndicator className="hidden sm:inline-flex" />
        {quickCreate}
        {userMenu}
      </div>
    </header>
  );
}
