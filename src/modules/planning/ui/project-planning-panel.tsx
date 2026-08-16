'use client';

import { useMemo, useState } from 'react';
import { pressableClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/shared/ui/cn';
import { collectPredecessorChain } from '../domain/dependencies';
import type {
  CriticalPathFoundation,
  GanttModel,
  PlanningDependency,
  PlanningOverdueFlags,
  PlanningWorkItem,
} from '../domain/types';
import { GanttChart } from './gantt-chart';
import {
  formatPlanningMessage,
  planningMessages,
  type PlanningLocale,
} from './messages';

export interface ProjectPlanningPanelProps {
  /** Project must be `work_kind=project`; jobs show opt-out message. */
  readonly workKind: 'project' | 'job';
  readonly locale?: PlanningLocale;
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
  readonly gantt: GanttModel | null;
  readonly overdue: readonly PlanningOverdueFlags[];
  readonly criticalPathFoundation: CriticalPathFoundation;
  /** Optional labels for linked work packages / phases. */
  readonly workPackageNames?: Readonly<Record<string, string>>;
  readonly phaseNames?: Readonly<Record<string, string>>;
}

export function ProjectPlanningPanel({
  workKind,
  locale = 'he-IL',
  workItems,
  dependencies,
  gantt,
  overdue,
  criticalPathFoundation,
  workPackageNames = {},
  phaseNames = {},
}: ProjectPlanningPanelProps) {
  const t = planningMessages(locale);
  const dir = locale === 'he-IL' ? 'rtl' : 'ltr';
  const [focusId, setFocusId] = useState<string | null>(null);

  const overdueIds = useMemo(() => new Set(overdue.map((o) => o.workItemId)), [overdue]);

  const focusedPredecessorIds = useMemo(() => {
    if (!focusId) return [] as string[];
    return [...collectPredecessorChain(focusId, dependencies)];
  }, [focusId, dependencies]);

  if (workKind !== 'project') {
    return (
      <section
        className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
        dir={dir}
        aria-label={t.title}
      >
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t.title}</h2>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t.jobsOptOut}</p>
      </section>
    );
  }

  return (
    <section
      className="space-y-4 text-start"
      dir={dir}
      aria-label={t.title}
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t.title}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t.subtitle}</p>
        <p
          className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm text-[var(--pf-text-primary)]"
          role="note"
        >
          {t.criticalPathLimitation}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {overdue.length > 0 ? (
          <StatusBadge shape="overdue" label={formatPlanningMessage(t.overdueCount, { count: overdue.length })} />
        ) : null}
        <span className="text-[var(--pf-text-secondary)]">
          {t.legendPlanned} · {t.legendProgress} · {t.legendMilestone} · {t.legendOverdue}
        </span>
      </div>

      {/* Desktop / tablet: full Gantt. Mobile: list-only (no forced giant chart). */}
      {gantt ? (
        <div className="hidden md:block space-y-2">
          <GanttChart
            model={gantt}
            messages={t}
            dir={dir}
            focusWorkItemId={focusId}
            focusedPredecessorIds={focusedPredecessorIds}
          />
          <p className="text-xs text-[var(--pf-text-secondary)]">{t.criticalPathLimitation}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-6 text-sm text-[var(--pf-text-secondary)]">
          <p className="font-medium text-[var(--pf-text-primary)]">{t.empty}</p>
          <p className="mt-1">{t.emptyHint}</p>
        </div>
      )}

      {workItems.length > 0 ? (
        <>
          {/* Mobile simplified timeline list */}
          <ul className="space-y-2 md:hidden">
            {workItems.map((item) => {
              const preds = dependencies
                .filter((d) => d.successorId === item.id)
                .map((d) => workItems.find((w) => w.id === d.predecessorId)?.name ?? d.predecessorId);
              const isOverdue = overdueIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-lg border border-[var(--pf-border-default)] p-3',
                    pressableClassName,
                    focusId === item.id ? 'bg-[var(--pf-bg-muted)]' : 'bg-[var(--pf-bg-surface)]',
                  )}
                  onClick={() => setFocusId((prev) => (prev === item.id ? null : item.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setFocusId((prev) => (prev === item.id ? null : item.id));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--pf-text-primary)]">{item.name}</span>
                    {item.kind === 'milestone' ? (
                      <span className="text-xs text-[var(--pf-text-secondary)]">{t.milestone}</span>
                    ) : null}
                    {isOverdue ? <StatusBadge shape="overdue" label={t.overdue} /> : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--pf-text-secondary)]">
                    <div>
                      <dt className="inline">{t.targetEnd}: </dt>
                      <dd className="inline tabular-nums text-[var(--pf-text-primary)]">
                        {item.targetEndDate ?? '-'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t.progress}: </dt>
                      <dd className="inline tabular-nums text-[var(--pf-text-primary)]">
                        {`${Math.round(item.progressPercent)}%`}
                      </dd>
                    </div>
                    {preds.length > 0 ? (
                      <div className="col-span-2">
                        <dt className="inline">{t.predecessors}: </dt>
                        <dd className="inline">{preds.join(', ')}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-[var(--pf-border-default)] md:block">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium">{t.task}</th>
                  <th className="px-3 py-2 font-medium">{t.start}</th>
                  <th className="px-3 py-2 font-medium">{t.targetEnd}</th>
                  <th className="px-3 py-2 font-medium">{t.actualEnd}</th>
                  <th className="px-3 py-2 font-medium">{t.progress}</th>
                  <th className="px-3 py-2 font-medium">{t.workArea}</th>
                  <th className="px-3 py-2 font-medium">{t.predecessors}</th>
                </tr>
              </thead>
              <tbody>
                {workItems.map((item) => {
                  const preds = dependencies
                    .filter((d) => d.successorId === item.id)
                    .map((d) => workItems.find((w) => w.id === d.predecessorId)?.name ?? d.predecessorId);
                  const isOverdue = overdueIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'cursor-pointer border-t border-[var(--pf-border-default)]',
                        pressableClassName,
                        'active:bg-[var(--pf-action-subtle-active)]',
                        focusId === item.id
                          ? 'bg-[var(--pf-bg-muted)]'
                          : 'hover:bg-[var(--pf-bg-muted)]/60',
                      )}
                      onClick={() => setFocusId((prev) => (prev === item.id ? null : item.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFocusId((prev) => (prev === item.id ? null : item.id));
                        }
                      }}
                      tabIndex={0}
                      role="button"
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.name}</span>
                          {item.kind === 'milestone' ? (
                            <span className="text-xs text-[var(--pf-text-secondary)]">
                              {t.milestone}
                            </span>
                          ) : null}
                          {isOverdue ? <StatusBadge shape="overdue" label={t.overdue} /> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{item.startDate ?? '-'}</td>
                      <td className="px-3 py-2 tabular-nums">{item.targetEndDate ?? '-'}</td>
                      <td className="px-3 py-2 tabular-nums">{item.actualEndDate ?? '-'}</td>
                      <td className="px-3 py-2 tabular-nums">{`${Math.round(item.progressPercent)}%`}</td>
                      <td className="px-3 py-2">
                        {item.workPackageId
                          ? (workPackageNames[item.workPackageId] ?? item.workPackageId.slice(0, 8))
                          : item.phaseId
                            ? `${t.phase}: ${phaseNames[item.phaseId] ?? item.phaseId.slice(0, 8)}`
                            : '-'}
                      </td>
                      <td className="px-3 py-2 text-[var(--pf-text-secondary)]">
                        {preds.length > 0 ? preds.join(', ') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* Always document CPM limitation - never claim critical path. */}
      {!criticalPathFoundation.supported ? (
        <p className="text-xs text-[var(--pf-text-secondary)]">{t.criticalPathLimitation}</p>
      ) : null}
    </section>
  );
}
