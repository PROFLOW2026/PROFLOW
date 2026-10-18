import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/shared/ui/cn';
import { employeeIconTileMutedClass, employeePanelClass } from './employee-surface-styles';

export function EmployeeEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly icon?: LucideIcon;
  readonly action?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        employeePanelClass,
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
      role="status"
    >
      <span className={employeeIconTileMutedClass} aria-hidden>
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--pf-text-primary)]">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm leading-relaxed text-[var(--pf-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
