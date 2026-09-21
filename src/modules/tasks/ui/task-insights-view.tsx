'use client';

import { AlertTriangle, BarChart3, Calendar, CheckCircle2, Clock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import {
  uwmSecondaryPanelClass,
  uwmSectionHeadingClass,
  uwmStatCardClass,
} from '@/shared/ui/uwm-surface-styles';
import type { TaskInsights } from '../application/get-task-insights';
import type { TaskStatus } from './_task-api-stub';

const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked'];

function StatCard({
  icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}) {
  return (
    <div
      className={cn(
        uwmStatCardClass,
        variant === 'danger' && 'border-[var(--pf-status-danger-border)]',
        variant === 'warning' && 'border-[var(--pf-status-warning-border)]',
        variant === 'success' && 'border-[var(--pf-status-success-border)]',
      )}
    >
      <div className="flex items-center gap-2 text-[var(--pf-text-secondary)]">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--pf-text-primary)]">{value}</p>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-[var(--pf-text-secondary)]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--pf-bg-muted)]">
        <div
          className="h-full rounded-full bg-[var(--pf-action-primary)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

export function TaskInsightsView({ insights }: { insights: TaskInsights }) {
  const t = useTranslations('tasks');

  const maxStatus = Math.max(...OPEN_STATUSES.map((s) => insights.byStatus[s]), 1);
  const maxAssignee = Math.max(...insights.byAssignee.map((r) => r.openCount), 1);
  const maxProject = Math.max(...insights.byProject.map((r) => r.openCount), 1);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className={cn('mb-3', uwmSectionHeadingClass)}>{t('insights.sections.summary')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={<Clock className="size-4" />}
            label={t('insights.stats.open')}
            value={insights.totalOpen}
          />
          <StatCard
            icon={<AlertTriangle className="size-4" />}
            label={t('insights.stats.overdue')}
            value={insights.overdue}
            variant={insights.overdue > 0 ? 'danger' : 'default'}
          />
          <StatCard
            icon={<Calendar className="size-4" />}
            label={t('insights.stats.dueThisWeek')}
            value={insights.dueThisWeek}
            variant={insights.dueThisWeek > 0 ? 'warning' : 'default'}
          />
          <StatCard
            icon={<BarChart3 className="size-4" />}
            label={t('insights.stats.blocked')}
            value={insights.blocked}
            variant={insights.blocked > 0 ? 'warning' : 'default'}
          />
          <StatCard
            icon={<CheckCircle2 className="size-4" />}
            label={t('insights.stats.completed')}
            value={insights.completed}
            variant="success"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={uwmSecondaryPanelClass}>
          <h2 className={cn('mb-3', uwmSectionHeadingClass)}>{t('insights.sections.byStatus')}</h2>
          <ul className="space-y-3">
            {OPEN_STATUSES.map((status) => (
              <BarRow
                key={status}
                label={t(`status.${status}`)}
                value={insights.byStatus[status]}
                max={maxStatus}
              />
            ))}
          </ul>
        </section>

        <section className={uwmSecondaryPanelClass}>
          <h2 className={cn('mb-3 flex items-center gap-2', uwmSectionHeadingClass)}>
            <Users className="size-4" />
            {t('insights.sections.byAssignee')}
          </h2>
          {insights.byAssignee.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('insights.empty.assignees')}</p>
          ) : (
            <ul className="space-y-3">
              {insights.byAssignee.map((row) => (
                <BarRow
                  key={row.assigneeId}
                  label={row.assigneeName}
                  value={row.openCount}
                  max={maxAssignee}
                />
              ))}
            </ul>
          )}
        </section>

        <section className={cn(uwmSecondaryPanelClass, 'lg:col-span-2')}>
          <h2 className={cn('mb-3', uwmSectionHeadingClass)}>{t('insights.sections.byProject')}</h2>
          {insights.byProject.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('insights.empty.projects')}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {insights.byProject.map((row) => (
                <BarRow
                  key={row.projectId ?? '__none__'}
                  label={row.projectName}
                  value={row.openCount}
                  max={maxProject}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
