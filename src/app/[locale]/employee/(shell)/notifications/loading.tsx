import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';

export default function EmployeeNotificationsLoading() {
  return (
    <div className={employeePageStackClass} aria-busy="true" aria-live="polite">
      <div className="space-y-1">
        <div className="h-8 w-56 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
      </div>
      <div className="h-11 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
      <div className="h-40 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
    </div>
  );
}
