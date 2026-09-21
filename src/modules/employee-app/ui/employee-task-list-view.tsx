'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  ALL_TASK_STATUSES,
  countActiveTaskFilters,
  defaultTaskFilterState,
  dueDateTone,
  filterEmployeeTasks,
  isTaskFilterActive,
  parseTaskFilterState,
  sortEmployeeTasks,
  taskFilterSearchParams,
  type EmployeeTaskListItem,
  type TaskFilterState,
} from './employee-filter-logic';
import {
  employeeFilterInputClass,
  employeeFilterSelectClass,
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePrimaryButtonClass,
  employeeScopeBarClass,
  employeeScopeTabClass,
} from './employee-surface-styles';
import { EmployeeListFilterBar, FilterField } from './employee-list-filter-bar';
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
  readonly canSeeCompanyScope: boolean;
  readonly assigneeOptions: ReadonlyArray<{ id: string; name: string }>;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
  readonly hideProjectFilter?: boolean;
  readonly hideScopeBar?: boolean;
  readonly hideProjectColumn?: boolean;
  readonly createTaskHref?: string | null;
}

export function EmployeeTaskListView({
  tasks,
  today,
  currentEmployeeId,
  canFilterByAssignee,
  canSeeCompanyScope,
  assigneeOptions,
  projectOptions,
  hideProjectFilter = false,
  hideScopeBar = false,
  hideProjectColumn = false,
  createTaskHref = null,
}: EmployeeTaskListViewProps) {
  const t = useTranslations('employeeApp');
  const tTasks = useTranslations('employeeApp.tasks');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const defaults = useMemo(
    () => defaultTaskFilterState(canFilterByAssignee),
    [canFilterByAssignee],
  );

  const appliedFilters = useMemo(
    () => parseTaskFilterState(new URLSearchParams(searchParams.toString()), canFilterByAssignee),
    [searchParams, canFilterByAssignee],
  );

  const filtered = useMemo(() => {
    const matched = filterEmployeeTasks(tasks, appliedFilters, today as never, currentEmployeeId);
    return sortEmployeeTasks(matched, today as never);
  }, [tasks, appliedFilters, today, currentEmployeeId]);

  const activeCount = countActiveTaskFilters(appliedFilters, defaults);
  const isActive = isTaskFilterActive(appliedFilters, defaults);

  function pushFilters(next: TaskFilterState) {
    const params = taskFilterSearchParams(next, defaults);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function clearFilters() {
    pushFilters(defaults);
  }

  function activeSummary(): string[] {
    const chips: string[] = [];
    if (appliedFilters.scope !== defaults.scope) {
      chips.push(
        appliedFilters.scope === 'company' ? t('filters.scopeCompany') : t('filters.scopeMine'),
      );
    }
    if (appliedFilters.status !== defaults.status) {
      let statusLabel = t('filters.statusOpen');
      if (appliedFilters.status === 'all') statusLabel = t('filters.all');
      else if (appliedFilters.status !== 'open') {
        statusLabel = tTasks(`status.${appliedFilters.status}`);
      }
      chips.push(t('filters.chipStatus', { value: statusLabel }));
    }
    if (appliedFilters.time !== defaults.time) {
      let timeLabel = t('filters.all');
      switch (appliedFilters.time) {
        case 'today':
          timeLabel = t('filters.timeToday');
          break;
        case 'overdue':
          timeLabel = t('filters.timeOverdue');
          break;
        case 'this_week':
          timeLabel = t('filters.timeThisWeek');
          break;
        case 'next_week':
          timeLabel = t('filters.timeNextWeek');
          break;
        case 'this_month':
          timeLabel = t('filters.timeThisMonth');
          break;
        case 'custom':
          timeLabel = t('filters.timeCustom');
          break;
      }
      chips.push(t('filters.chipTime', { value: timeLabel }));
    }
    if (appliedFilters.projectId) {
      const project = projectOptions.find((row) => row.id === appliedFilters.projectId);
      chips.push(t('filters.chipProject', { value: project?.displayName ?? t('filters.project') }));
    }
    if (appliedFilters.query.trim()) {
      chips.push(t('filters.chipSearch', { value: appliedFilters.query.trim() }));
    }
    if (appliedFilters.assignee === 'me') {
      chips.push(t('filters.chipAssignee', { value: t('filters.assigneeMe') }));
    } else if (appliedFilters.assignee !== defaults.assignee) {
      const assignee = assigneeOptions.find((row) => row.id === appliedFilters.assignee);
      chips.push(t('filters.chipAssignee', { value: assignee?.name ?? t('filters.assignee') }));
    }
    if (appliedFilters.priority !== defaults.priority) {
      chips.push(
        t('filters.chipPriority', { value: tTasks(`priority.${appliedFilters.priority}`) }),
      );
    }
    if (appliedFilters.dateFrom || appliedFilters.dateTo) {
      chips.push(t('filters.chipTime', { value: t('filters.timeCustom') }));
    }
    return chips;
  }

  return (
    <div className="space-y-4">
      {createTaskHref ? (
        <div className="flex justify-end">
          <Link href={createTaskHref} className={employeePrimaryButtonClass}>
            {tTasks('createNewTask')}
          </Link>
        </div>
      ) : null}

      {canSeeCompanyScope && !hideScopeBar ? (
        <div className={employeeScopeBarClass} role="tablist" aria-label={t('filters.scopeTitle')}>
          <button
            type="button"
            role="tab"
            aria-selected={appliedFilters.scope === 'company'}
            className={employeeScopeTabClass(appliedFilters.scope === 'company')}
            onClick={() => pushFilters({ ...appliedFilters, scope: 'company', assignee: 'all' })}
          >
            {t('filters.scopeCompany')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={appliedFilters.scope === 'mine'}
            className={employeeScopeTabClass(appliedFilters.scope === 'mine')}
            onClick={() => pushFilters({ ...appliedFilters, scope: 'mine', assignee: 'all' })}
          >
            {t('filters.scopeMine')}
          </button>
        </div>
      ) : null}

      <TaskFilterControls
        key={searchParams.toString()}
        appliedFilters={appliedFilters}
        defaults={defaults}
        canFilterByAssignee={canFilterByAssignee}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        hideProjectFilter={hideProjectFilter}
        onApply={pushFilters}
        onClear={clearFilters}
        activeSummary={activeSummary()}
        isActive={isActive}
        activeCount={activeCount}
      />

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('filters.resultCount', { count: filtered.length })}
        </p>
      </div>

      <ul className={employeeListPanelClass}>
        {filtered.map((task) => {
          const tone = dueDateTone(task.dueDate, today as never, task.status);
          return (
            <li key={task.id} className="group relative">
              <Link href={`/employee/tasks/${task.id}`} className={employeeListRowLinkClass}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-base font-semibold leading-snug text-[var(--pf-text-primary)]">
                      {task.title}
                    </div>
                    {task.projectDisplayName && !hideProjectColumn ? (
                      <p className="truncate text-sm font-medium text-[var(--pf-text-secondary)]">
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
          <li className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {tasks.length === 0 ? tTasks('emptyPmTasks') : t('filters.emptyTasksDetailed')}
            </p>
            {tasks.length > 0 && isActive ? (
              <button type="button" className={employeePrimaryButtonClass} onClick={clearFilters}>
                {t('filters.clear')}
              </button>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

interface TaskFilterControlsProps {
  readonly appliedFilters: TaskFilterState;
  readonly defaults: TaskFilterState;
  readonly canFilterByAssignee: boolean;
  readonly assigneeOptions: ReadonlyArray<{ id: string; name: string }>;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
  readonly hideProjectFilter?: boolean;
  readonly onApply: (next: TaskFilterState) => void;
  readonly onClear: () => void;
  readonly activeSummary: readonly string[];
  readonly isActive: boolean;
  readonly activeCount: number;
}

function TaskFilterControls({
  appliedFilters,
  canFilterByAssignee,
  assigneeOptions,
  projectOptions,
  hideProjectFilter = false,
  onApply,
  onClear,
  activeSummary,
  isActive,
  activeCount,
}: TaskFilterControlsProps) {
  const t = useTranslations('employeeApp');
  const tTasks = useTranslations('employeeApp.tasks');
  const locale = useLocale();
  const [draft, setDraft] = useState<TaskFilterState>(appliedFilters);

  return (
    <EmployeeListFilterBar
      title={t('filters.tasksTitle')}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={activeSummary}
      onApply={() => onApply(draft)}
      onClear={onClear}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterField label={t('filters.search')}>
          <input
            type="search"
            value={draft.query}
            placeholder={t('lists.projectSearchPlaceholder')}
            className={employeeFilterInputClass}
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
          />
        </FilterField>

        <FilterField label={t('filters.status')}>
          <select
            value={draft.status}
            className={employeeFilterSelectClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as TaskFilterState['status'],
              }))
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
            value={draft.time}
            className={employeeFilterSelectClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                time: event.target.value as TaskFilterState['time'],
              }))
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

        {!hideProjectFilter ? (
          <FilterField label={t('filters.project')}>
            <select
              value={draft.projectId}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, projectId: event.target.value }))
              }
            >
              <option value="">{t('filters.allProjects')}</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}

        <FilterField label={t('filters.priority')}>
          <select
            value={draft.priority}
            className={employeeFilterSelectClass}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                priority: event.target.value as TaskFilterState['priority'],
              }))
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
              value={draft.assignee}
              className={employeeFilterSelectClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, assignee: event.target.value }))
              }
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

      {draft.time === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterField label={t('filters.dateFrom')}>
            <input
              type="date"
              value={draft.dateFrom}
              lang={locale}
              className={employeeFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, dateFrom: event.target.value }))
              }
            />
          </FilterField>
          <FilterField label={t('filters.dateTo')}>
            <input
              type="date"
              value={draft.dateTo}
              lang={locale}
              className={employeeFilterInputClass}
              onChange={(event) =>
                setDraft((current) => ({ ...current, dateTo: event.target.value }))
              }
            />
          </FilterField>
        </div>
      ) : null}
    </EmployeeListFilterBar>
  );
}
