'use client';

import { useMemo, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  ALL_TASK_STATUSES,
  dueDateTone,
  filterEmployeeTasks,
  parseTaskFilterState,
  sortEmployeeTasks,
  taskFilterSearchParams,
  type EmployeeTaskListItem,
  type TaskFilterState,
} from './employee-filter-logic';
import {
  employeeFilterBarClass,
  employeeFilterInputClass,
  employeeFilterSelectClass,
  employeeListPanelClass,
  employeeListRowLinkClass,
} from './employee-surface-styles';
import { EmployeePostponeMenu } from './employee-postpone-menu';

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-muted)] line-through',
  blocked: 'bg-red-100 text-red-700',
};

interface EmployeeTaskListViewProps {
  readonly tasks: readonly EmployeeTaskListItem[];
  readonly today: string;
  readonly currentEmployeeId: string;
  readonly canFilterByAssignee: boolean;
  readonly assigneeOptions: ReadonlyArray<{ id: string; name: string }>;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
}

export function EmployeeTaskListView({
  tasks,
  today,
  currentEmployeeId,
  canFilterByAssignee,
  assigneeOptions,
  projectOptions,
}: EmployeeTaskListViewProps) {
  const t = useTranslations('employeeApp');
  const tTasks = useTranslations('employeeApp.tasks');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const filters = useMemo(
    () => parseTaskFilterState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const filtered = useMemo(() => {
    const matched = filterEmployeeTasks(tasks, filters, today as never, currentEmployeeId);
    return sortEmployeeTasks(matched, today as never);
  }, [tasks, filters, today, currentEmployeeId]);

  function applyFilters(next: TaskFilterState) {
    const params = taskFilterSearchParams(next);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function updateFilter(patch: Partial<TaskFilterState>) {
    applyFilters({ ...filters, ...patch });
  }

  return (
    <div className="space-y-4">
      <section className={employeeFilterBarClass} aria-label={t('filters.title')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label={t('filters.search')}>
            <input
              type="search"
              defaultValue={filters.query}
              placeholder={t('lists.projectSearchPlaceholder')}
              className={employeeFilterInputClass}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  updateFilter({ query: event.currentTarget.value });
                }
              }}
              onBlur={(event) => {
                if (event.target.value !== filters.query) {
                  updateFilter({ query: event.target.value });
                }
              }}
            />
          </FilterField>

          <FilterField label={t('filters.status')}>
            <select
              value={filters.status}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                updateFilter({ status: event.target.value as TaskFilterState['status'] })
              }
            >
              <option value="open">{t('filters.statusOpen')}</option>
              <option value="all">{t('filters.all')}</option>
              {ALL_TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tTasks(`status.${status}`)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label={t('filters.time')}>
            <select
              value={filters.time}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                updateFilter({ time: event.target.value as TaskFilterState['time'] })
              }
            >
              <option value="all">{t('filters.all')}</option>
              <option value="today">{t('filters.timeToday')}</option>
              <option value="overdue">{t('filters.timeOverdue')}</option>
              <option value="this_week">{t('filters.timeThisWeek')}</option>
              <option value="next_week">{t('filters.timeNextWeek')}</option>
              <option value="this_month">{t('filters.timeThisMonth')}</option>
              <option value="custom">{t('filters.timeCustom')}</option>
            </select>
          </FilterField>

          <FilterField label={t('filters.project')}>
            <select
              value={filters.projectId}
              className={employeeFilterSelectClass}
              onChange={(event) => updateFilter({ projectId: event.target.value })}
            >
              <option value="">{t('filters.allProjects')}</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label={t('filters.priority')}>
            <select
              value={filters.priority}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                updateFilter({ priority: event.target.value as TaskFilterState['priority'] })
              }
            >
              <option value="all">{t('filters.all')}</option>
              <option value="none">{tTasks('priority.none')}</option>
              <option value="low">{tTasks('priority.low')}</option>
              <option value="medium">{tTasks('priority.medium')}</option>
              <option value="high">{tTasks('priority.high')}</option>
              <option value="urgent">{tTasks('priority.urgent')}</option>
            </select>
          </FilterField>

          {canFilterByAssignee ? (
            <FilterField label={t('filters.assignee')}>
              <select
                value={filters.assignee}
                className={employeeFilterSelectClass}
                onChange={(event) => updateFilter({ assignee: event.target.value })}
              >
                <option value="all">{t('filters.assigneeAll')}</option>
                <option value="me">{t('filters.assigneeMe')}</option>
                {assigneeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </FilterField>
          ) : null}
        </div>

        {filters.time === 'custom' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterField label={t('filters.dateFrom')}>
              <input
                type="date"
                value={filters.dateFrom}
                lang={locale}
                className={employeeFilterInputClass}
                onChange={(event) => updateFilter({ dateFrom: event.target.value })}
              />
            </FilterField>
            <FilterField label={t('filters.dateTo')}>
              <input
                type="date"
                value={filters.dateTo}
                lang={locale}
                className={employeeFilterInputClass}
                onChange={(event) => updateFilter({ dateTo: event.target.value })}
              />
            </FilterField>
          </div>
        ) : null}
      </section>

      <ul className={employeeListPanelClass}>
        {filtered.map((task) => {
          const tone = dueDateTone(task.dueDate, today as never, task.status);
          return (
            <li key={task.id} className="group relative">
              <Link href={`/employee/tasks/${task.id}`} className={employeeListRowLinkClass}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-sm font-medium leading-snug">{task.title}</div>
                    {task.projectDisplayName ? (
                      <p className="truncate text-xs text-[var(--pf-text-secondary)]">
                        {task.projectDisplayName}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_COLOR[task.status] ?? STATUS_COLOR.todo,
                        )}
                      >
                        {tTasks(`status.${task.status}`, { defaultValue: task.status })}
                      </span>
                      {task.priority && task.priority !== 'none' ? (
                        <span className="text-xs text-[var(--pf-text-muted)]">
                          {tTasks(`priority.${task.priority}`, { defaultValue: task.priority })}
                        </span>
                      ) : null}
                      {task.dueDate ? (
                        <span
                          className={cn(
                            'text-xs font-medium',
                            tone === 'overdue' && 'text-red-600',
                            tone === 'today' && 'text-[var(--pf-primary)]',
                            tone === 'future' && 'text-[var(--pf-text-muted)]',
                          )}
                        >
                          {tTasks('dueDate', { date: task.dueDate })}
                        </span>
                      ) : null}
                      {task.assigneeLabel ? (
                        <span className="text-xs text-[var(--pf-text-secondary)]">
                          {task.assigneeLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {task.canPostpone ? (
                    <EmployeePostponeMenu
                      taskId={task.id}
                      dueDate={task.dueDate}
                      today={today}
                      compact
                    />
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">
            {tasks.length === 0 ? tTasks('emptyPmTasks') : t('filters.emptyTasks')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
