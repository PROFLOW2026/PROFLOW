'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { buildGanttModel } from '@/modules/planning/domain/gantt-layout';
import { mapTaskCardsToGanttWorkItems } from '../domain/task-gantt-source';
import type { TaskCardData } from './task-api';
import { cn } from '@/shared/ui/cn';

export interface TaskTimelineGanttProps {
  tasks: readonly TaskCardData[];
  today: string;
  onOpenTask: (taskId: string) => void;
  className?: string;
}

export function TaskTimelineGantt({ tasks, today, onOpenTask, className }: TaskTimelineGanttProps) {
  const t = useTranslations('tasks');
  const model = useMemo(
    () =>
      buildGanttModel({
        workItems: mapTaskCardsToGanttWorkItems(tasks),
        dependencies: [],
        today,
        padDays: 2,
      }),
    [tasks, today],
  );

  if (!model || model.bars.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={t('timeline.pageTitle')}
      className={cn('hidden flex-col gap-2 md:flex', className)}
    >
      <div className="relative overflow-x-auto rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
        <div className="min-w-[640px]">
          {model.bars.map((bar) => {
            const left = (bar.startOffsetDays / model.totalDays) * 100;
            const width = Math.max(
              bar.isMilestone ? 0.6 : 2,
              (Math.max(bar.durationDays, bar.isMilestone ? 0 : 1) / model.totalDays) * 100,
            );
            return (
              <div key={bar.workItemId} className="grid grid-cols-[minmax(8rem,12rem)_1fr] items-center gap-2 py-1">
                <button
                  type="button"
                  onClick={() => onOpenTask(bar.workItemId)}
                  className="truncate text-start text-sm font-medium text-[var(--pf-text-primary)] hover:underline"
                >
                  {bar.name}
                </button>
                <div className="relative h-6 rounded bg-[var(--pf-bg-subtle)]">
                  <div
                    role="presentation"
                    className={cn(
                      'absolute top-1/2 h-3 -translate-y-1/2 rounded-sm',
                      bar.isMilestone
                        ? 'size-3 rounded-full bg-[var(--pf-action-primary)]'
                        : 'bg-[var(--pf-teal-500)]',
                      bar.overdue && 'bg-[var(--pf-status-danger-fg)]',
                    )}
                    style={{
                      insetInlineStart: `${left}%`,
                      width: bar.isMilestone ? undefined : `${width}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
