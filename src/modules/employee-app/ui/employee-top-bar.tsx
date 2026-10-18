import { OrgShellMark } from '@/components/shell/org-shell-mark';
import { EmployeeUserMenu } from './employee-user-menu';

export interface EmployeeTopBarProps {
  readonly employeeName: string;
  readonly email: string;
  readonly organizationName: string;
}

export function EmployeeTopBar({
  employeeName,
  email,
  organizationName,
}: EmployeeTopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-[var(--pf-topbar-height)] w-full shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[color-mix(in_srgb,var(--pf-bg-surface)_92%,transparent)] px-4 backdrop-blur-md print:hidden sm:gap-3 supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--pf-bg-surface)_84%,transparent)]">
      <span className="flex min-w-0 items-center gap-2.5 lg:hidden">
        <OrgShellMark organizationName={organizationName} />
        <span className="max-w-44 truncate text-sm font-semibold text-[var(--pf-text-primary)]">
          {organizationName}
        </span>
      </span>

      <div className="min-w-0 flex-1" />

      <EmployeeUserMenu
        employeeName={employeeName}
        email={email}
        organizationName={organizationName}
      />
    </header>
  );
}
