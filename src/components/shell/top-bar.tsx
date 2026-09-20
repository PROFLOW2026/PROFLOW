import * as React from 'react';
import { ConnectivityIndicator } from '@/modules/offline/ui/connectivity-banner';
import { GlobalSearchLazy } from '@/modules/search/ui/global-search-lazy';
import { OrgShellMark } from './org-shell-mark';
import { OrganizationSwitcher, type OrganizationSwitcherProps } from './organization-switcher';

export function TopBar({
  organizationName,
  organizationLogoUrl,
  organizationSwitcher,
  quickCreate,
  userMenu,
  notifications,
}: {
  organizationName: string;
  organizationLogoUrl?: string | null;
  organizationSwitcher?: OrganizationSwitcherProps;
  quickCreate?: React.ReactNode;
  userMenu: React.ReactNode;
  notifications?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[var(--pf-topbar-height)] w-full min-w-0 shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 print:hidden sm:gap-3">
      <span className="flex shrink-0 items-center gap-2 lg:hidden">
        <OrgShellMark organizationName={organizationName} logoUrl={organizationLogoUrl} />
      </span>

      {organizationSwitcher ? (
        <OrganizationSwitcher {...organizationSwitcher} />
      ) : (
        <span className="min-w-0 max-w-[min(100%,18rem)] truncate text-sm font-semibold">
          {organizationName}
        </span>
      )}

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        <GlobalSearchLazy />
        {notifications}
        <ConnectivityIndicator className="hidden sm:inline-flex" />
        {quickCreate}
        {userMenu}
      </div>
    </header>
  );
}
