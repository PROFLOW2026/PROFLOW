'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  TaskFiltersBar,
  applyClientTaskFilters,
  DEFAULT_TASK_FILTER_STATE,
  type TaskFilterBarState,
} from '@/modules/tasks/ui/task-filters-bar';
import { TaskCalendarView } from '@/modules/tasks/ui/task-calendar-view';
import type { TaskCardData } from '@/modules/tasks/ui/_task-api-stub';

export function EmployeeTasksCalendarClient({
  tasks,
  today,
}: {
  tasks: TaskCardData[];
  today: string;
}) {
  const router = useRouter();
  const t = useTranslations('tasks');
  const [filters, setFilters] = useState<TaskFilterBarState>(DEFAULT_TASK_FILTER_STATE);

  const filteredTasks = useMemo(
    () => applyClientTaskFilters(tasks, filters, today),
    [tasks, filters, today],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t('calendar.pageTitle')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('calendar.pageDescription')}</p>
      </div>
      <TaskFiltersBar value={filters} onChange={setFilters} />
      <TaskCalendarView
        tasks={filteredTasks}
        today={today}
        onOpenTask={(taskId) => router.push(`/employee/tasks/${taskId}`)}
        showProject
      />
    </div>
  );
}
