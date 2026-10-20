import * as React from 'react';
import { ConnectivityIndicator } from '@/modules/offline/ui/connectivity-banner';
import { GlobalSearchLazy } from '@/modules/search/ui/global-search-lazy';
import { OrgShellMark } from './org-shell-mark';
import { ThemeHeaderToggle } from './theme-switcher';

export function TopBar({
  organizationName,
  organizationLogoUrl,
  quickCreate,
  userMenu,
  notifications,
}: {
  organizationName: string;
  organizationLogoUrl?: string | null;
  quickCreate?: React.ReactNode;
  userMenu: React.ReactNode;
  notifications?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[var(--pf-topbar-height)] w-full min-w-0 max-w-full shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 print:hidden sm:gap-3 sm:px-4">
      <span className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <OrgShellMark organizationName={organizationName} logoUrl={organizationLogoUrl} />
        <span className="min-w-0 truncate text-sm font-semibold">{organizationName}</span>
      </span>

      <div className="hidden min-w-0 flex-1 lg:block" />

      <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
        <GlobalSearchLazy />
        <ThemeHeaderToggle />
        {notifications}
        <ConnectivityIndicator className="hidden sm:inline-flex" />
        {quickCreate}
        {userMenu}
      </div>
    </header>
  );
}
