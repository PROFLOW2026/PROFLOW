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
    <header className="sticky top-0 z-40 flex h-[var(--pf-topbar-height)] w-full shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <OrgShellMark organizationName={organizationName} />
        <span className="truncate text-sm font-semibold">{organizationName}</span>
      </span>
      <EmployeeUserMenu
        employeeName={employeeName}
        email={email}
        organizationName={organizationName}
      />
    </header>
  );
}
