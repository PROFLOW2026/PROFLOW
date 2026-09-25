import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { EmployeeTaskAttentionItem, EmployeeTaskAttentionKind } from '../domain/employee-task-attention';
import { employeeListPanelClass, employeeListRowLinkClass } from './employee-surface-styles';

export function EmployeeTaskAttentionBlock({
  title,
  items,
  labelFor,
}: {
  readonly title: string;
  readonly items: readonly EmployeeTaskAttentionItem[];
  readonly labelFor: (kind: EmployeeTaskAttentionKind) => string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-[var(--pf-text-primary)]">{title}</h2>
      <ul className={employeeListPanelClass}>
        {items.map((item) => (
          <li key={`${item.kind}:${item.taskId}`}>
            <Link href={item.href} className={employeeListRowLinkClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.projectLabel ? (
                    <p className="truncate text-xs text-[var(--pf-text-secondary)]">{item.projectLabel}</p>
                  ) : null}
                  {item.dueDate ? (
                    <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">{item.dueDate}</p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    item.kind === 'overdue'
                      ? 'bg-red-50 text-red-700'
                      : item.kind === 'dueToday'
                        ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
                        : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]',
                  )}
                >
                  {labelFor(item.kind)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
