'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from '@/shared/i18n/navigation';
import { reassignWorkloadTaskAction } from './actions';
import type { WorkloadEmployeeRow, WorkloadTaskPreview } from '@/modules/tasks/application/get-team-workload';
import { cn } from '@/shared/ui/cn';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { uwmListPanelClass } from '@/shared/ui/uwm-surface-styles';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewTaskWithEmployee extends WorkloadTaskPreview {
  employeeId: string;
}

interface WorkloadExpandableRowsProps {
  rows: readonly WorkloadEmployeeRow[];
  showEstimatedEffort: boolean;
  canAssign: boolean;
  initialExpandedId: string | null;
  initialPreviewTasks: PreviewTaskWithEmployee[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type DueDateTranslator = (
  key:
    | 'workload.preview.noDueDate'
    | 'workload.preview.overdueDays'
    | 'workload.preview.dueToday'
    | 'workload.preview.dueTomorrow'
    | 'workload.preview.dueInDays',
  values?: { count: number },
) => string;

function dueDateLabel(dueDate: string | null, t: DueDateTranslator): string {
  if (!dueDate) return t('workload.preview.noDueDate');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return t('workload.preview.overdueDays', { count: Math.abs(diffDays) });
  if (diffDays === 0) return t('workload.preview.dueToday');
  if (diffDays === 1) return t('workload.preview.dueTomorrow');
  return t('workload.preview.dueInDays', { count: diffDays });
}

function dueDateClass(dueDate: string | null): string {
  if (!dueDate) return 'text-[var(--pf-text-muted)]';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-600 dark:text-red-400 font-semibold';
  if (diffDays === 0) return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-[var(--pf-text-secondary)]';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkloadExpandableRows({
  rows,
  showEstimatedEffort,
  canAssign,
  initialExpandedId,
  initialPreviewTasks,
}: WorkloadExpandableRowsProps) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);
  const [taskCache, setTaskCache] = useState<Record<string, WorkloadTaskPreview[]>>(
    initialExpandedId && initialPreviewTasks.length > 0
      ? { [initialExpandedId]: initialPreviewTasks }
      : {},
  );
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const colSpan = showEstimatedEffort ? 6 : 5;

  const reassignTargets = rows.map((row) => ({ employeeId: row.employeeId, name: row.name }));

  async function handleReassign(
    taskId: string,
    fromEmployeeId: string,
    toEmployeeId: string,
  ): Promise<void> {
    setReassignError(null);
    setReassigningTaskId(taskId);
    try {
      const result = await reassignWorkloadTaskAction(taskId, fromEmployeeId, toEmployeeId);
      if (!result.success) {
        setReassignError(result.error ?? t('workload.reassignFailed'));
        return;
      }
      startTransition(() => {
        setTaskCache((prev) => {
          const next = { ...prev };
          for (const employeeId of Object.keys(next)) {
            next[employeeId] = next[employeeId]!.filter((task) => task.taskId !== taskId);
          }
          return next;
        });
      });
      router.refresh();
    } catch {
      setReassignError(t('workload.reassignFailed'));
    } finally {
      setReassigningTaskId(null);
    }
  }

  async function toggleEmployee(employeeId: string) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(employeeId);

    // Load preview tasks if not already cached
    if (!taskCache[employeeId]) {
      setLoading(true);
      try {
        const res = await fetch(`/api/workload/employee-preview?employeeId=${employeeId}`);
        if (res.ok) {
          const data: WorkloadTaskPreview[] = await res.json();
          startTransition(() => {
            setTaskCache((prev) => ({ ...prev, [employeeId]: data }));
          });
        }
      } catch {
        // ignore; show empty
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className={cn('overflow-x-auto', uwmListPanelClass)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{t('workload.columns.employee')}</TableHead>
            <TableHead numeric>{t('workload.columns.openTasks')}</TableHead>
            <TableHead numeric>{t('workload.columns.overdue')}</TableHead>
            <TableHead numeric>{t('workload.columns.dueThisWeek')}</TableHead>
            <TableHead numeric>{t('workload.columns.projects')}</TableHead>
            {showEstimatedEffort && <TableHead numeric>{t('workload.columns.estimatedEffort')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedId === row.employeeId;
            const previewTasks = taskCache[row.employeeId] ?? [];

            return (
              <>
                {/* Main employee row */}
                <TableRow
                  key={row.employeeId}
                  className={cn(
                    'cursor-pointer hover:bg-[var(--pf-bg-secondary)] transition-colors',
                    isExpanded && 'bg-[var(--pf-bg-secondary)]',
                  )}
                  onClick={() => toggleEmployee(row.employeeId)}
                >
                  {/* Expand toggle */}
                  <TableCell className="py-2">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? t('workload.preview.collapse') : t('workload.preview.expand')}
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--pf-text-muted)] hover:text-[var(--pf-text-primary)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEmployee(row.employeeId);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </TableCell>

                  {/* Employee name */}
                  <TableCell className="font-medium">{row.name}</TableCell>

                  {/* Open tasks */}
                  <TableCell numeric>
                    <span className={row.openTasks > 0 ? 'font-medium' : 'text-[var(--pf-text-muted)]'}>
                      {row.openTasks}
                    </span>
                  </TableCell>

                  {/* Overdue */}
                  <TableCell numeric>
                    {row.overdueTasks > 0 ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {row.overdueTasks}
                      </span>
                    ) : (
                      <span className="text-[var(--pf-text-muted)]">0</span>
                    )}
                  </TableCell>

                  {/* Due this week */}
                  <TableCell numeric>
                    {row.dueThisWeek > 0 ? (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {row.dueThisWeek}
                      </span>
                    ) : (
                      <span className="text-[var(--pf-text-muted)]">0</span>
                    )}
                  </TableCell>

                  {/* Projects */}
                  <TableCell numeric>
                    <span className={row.projectCount > 0 ? '' : 'text-[var(--pf-text-muted)]'}>
                      {row.projectCount}
                    </span>
                  </TableCell>

                  {/* Estimated effort */}
                  {showEstimatedEffort && (
                    <TableCell numeric>
                      <span className="text-[var(--pf-text-secondary)]">
                        {formatMinutes(row.totalEstimatedMinutes)}
                      </span>
                    </TableCell>
                  )}
                </TableRow>

                {/* Expanded row: task preview */}
                {isExpanded && (
                  <TableRow key={`${row.employeeId}-expanded`} className="bg-[var(--pf-bg-tertiary)]">
                    <TableCell colSpan={colSpan + 1} className="p-0">
                      <div className="px-6 py-3">
                        {loading && previewTasks.length === 0 ? (
                          <p className="py-2 text-sm text-[var(--pf-text-muted)]">{t('workload.preview.loading')}</p>
                        ) : previewTasks.length === 0 ? (
                          <p className="py-2 text-sm text-[var(--pf-text-muted)]">
                            {t('workload.preview.noTasks')}
                          </p>
                        ) : (
                          <>
                          {reassignError ? (
                            <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
                              {reassignError}
                            </p>
                          ) : null}
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--pf-border)]">
                                <th className="pb-1.5 pe-4 text-start font-medium text-[var(--pf-text-muted)]">
                                  {t('workload.preview.columns.task')}
                                </th>
                                <th className="pb-1.5 pe-4 text-start font-medium text-[var(--pf-text-muted)]">
                                  {t('workload.preview.columns.project')}
                                </th>
                                <th className="pb-1.5 pe-4 text-start font-medium text-[var(--pf-text-muted)]">
                                  {t('workload.preview.columns.due')}
                                </th>
                                <th className="pb-1.5 text-start font-medium text-[var(--pf-text-muted)]">
                                  {t('workload.preview.columns.status')}
                                </th>
                                {canAssign && (
                                  <th className="pb-1.5 text-start font-medium text-[var(--pf-text-muted)]">
                                    {t('workload.reassign')}
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--pf-border)]">
                              {previewTasks.map((task) => (
                                <tr key={task.taskId} className="hover:bg-[var(--pf-bg-secondary)]">
                                  <td className="py-1.5 pe-4">
                                    <Link
                                      href={`/tasks/${task.taskId}`}
                                      className={cn(textNavLinkClassName, 'rounded-sm')}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {task.title}
                                    </Link>
                                  </td>
                                  <td className="py-1.5 pe-4 text-[var(--pf-text-secondary)]">
                                    {task.projectId ? (
                                      <Link
                                        href={`/projects/${task.projectId}`}
                                        className="hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {task.projectName ?? '—'}
                                      </Link>
                                    ) : (
                                      <span className="text-[var(--pf-text-muted)]">
                                        {task.projectName ?? t('workload.preview.noProject')}
                                      </span>
                                    )}
                                  </td>
                                  <td className={cn('py-1.5 pe-4', dueDateClass(task.dueDate))}>
                                    {dueDateLabel(task.dueDate, t)}
                                  </td>
                                  <td className="py-1.5 pe-4 text-[var(--pf-text-secondary)]">
                                    <span className="rounded bg-[var(--pf-bg-secondary)] px-1.5 py-0.5 text-xs">
                                      {t(`status.${task.status}`)}
                                    </span>
                                  </td>
                                  {canAssign && (
                                    <td className="py-1.5">
                                      <WorkloadReassignSelect
                                        taskId={task.taskId}
                                        fromEmployeeId={row.employeeId}
                                        targets={reassignTargets}
                                        disabled={reassigningTaskId === task.taskId}
                                        onReassign={handleReassign}
                                        placeholder={t('workload.reassignTo')}
                                        busyLabel={t('workload.reassigning')}
                                      />
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline reassign (tasks.assign — server action → assign-task.ts)
// ---------------------------------------------------------------------------

function WorkloadReassignSelect({
  taskId,
  fromEmployeeId,
  targets,
  disabled,
  onReassign,
  placeholder,
  busyLabel,
}: {
  taskId: string;
  fromEmployeeId: string;
  targets: readonly { employeeId: string; name: string }[];
  disabled: boolean;
  onReassign: (taskId: string, fromEmployeeId: string, toEmployeeId: string) => void;
  placeholder: string;
  busyLabel: string;
}) {
  const options = targets.filter((target) => target.employeeId !== fromEmployeeId);
  if (options.length === 0) {
    return <span className="text-xs text-[var(--pf-text-muted)]">—</span>;
  }

  return (
    <select
      className="max-w-[10rem] rounded border border-[var(--pf-border)] bg-[var(--pf-bg-primary)] px-2 py-0.5 text-xs text-[var(--pf-text-secondary)] disabled:opacity-60"
      defaultValue=""
      disabled={disabled}
      aria-label={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        const toEmployeeId = e.target.value;
        if (!toEmployeeId) return;
        onReassign(taskId, fromEmployeeId, toEmployeeId);
        e.target.value = '';
      }}
    >
      <option value="">{disabled ? busyLabel : placeholder}</option>
      {options.map((option) => (
        <option key={option.employeeId} value={option.employeeId}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
