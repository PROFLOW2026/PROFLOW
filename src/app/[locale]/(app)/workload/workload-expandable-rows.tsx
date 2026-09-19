'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WorkloadEmployeeRow, WorkloadTaskPreview } from '@/modules/tasks/application/get-team-workload';
import { cn } from '@/shared/ui/cn';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
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

function dueDateLabel(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  return `Due in ${diffDays}d`;
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
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId);
  const [taskCache, setTaskCache] = useState<Record<string, WorkloadTaskPreview[]>>(
    initialExpandedId && initialPreviewTasks.length > 0
      ? { [initialExpandedId]: initialPreviewTasks }
      : {},
  );
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const colSpan = showEstimatedEffort ? 6 : 5;

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
    <div className="overflow-x-auto rounded-lg border border-[var(--pf-border)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Employee</TableHead>
            <TableHead numeric>Open Tasks</TableHead>
            <TableHead numeric>Overdue</TableHead>
            <TableHead numeric>Due This Week</TableHead>
            <TableHead numeric>Projects</TableHead>
            {showEstimatedEffort && <TableHead numeric>Est. Effort</TableHead>}
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
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
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
                          <p className="py-2 text-sm text-[var(--pf-text-muted)]">Loading…</p>
                        ) : previewTasks.length === 0 ? (
                          <p className="py-2 text-sm text-[var(--pf-text-muted)]">
                            No open or upcoming tasks.
                          </p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--pf-border)]">
                                <th className="pb-1.5 pr-4 text-left font-medium text-[var(--pf-text-muted)]">
                                  Task
                                </th>
                                <th className="pb-1.5 pr-4 text-left font-medium text-[var(--pf-text-muted)]">
                                  Project
                                </th>
                                <th className="pb-1.5 pr-4 text-left font-medium text-[var(--pf-text-muted)]">
                                  Due
                                </th>
                                <th className="pb-1.5 text-left font-medium text-[var(--pf-text-muted)]">
                                  Status
                                </th>
                                {canAssign && (
                                  <th className="pb-1.5 text-left font-medium text-[var(--pf-text-muted)]">
                                    Reassign
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--pf-border)]">
                              {previewTasks.map((task) => (
                                <tr key={task.taskId} className="hover:bg-[var(--pf-bg-secondary)]">
                                  <td className="py-1.5 pr-4">
                                    <Link
                                      href={`/tasks/${task.taskId}`}
                                      className={cn(textNavLinkClassName, 'rounded-sm')}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {task.title}
                                    </Link>
                                  </td>
                                  <td className="py-1.5 pr-4 text-[var(--pf-text-secondary)]">
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
                                        {task.projectName ?? 'No project'}
                                      </span>
                                    )}
                                  </td>
                                  <td className={cn('py-1.5 pr-4', dueDateClass(task.dueDate))}>
                                    {dueDateLabel(task.dueDate)}
                                  </td>
                                  <td className="py-1.5 pr-4 text-[var(--pf-text-secondary)]">
                                    <span className="rounded bg-[var(--pf-bg-secondary)] px-1.5 py-0.5 text-xs capitalize">
                                      {task.status.replace('_', ' ')}
                                    </span>
                                  </td>
                                  {canAssign && (
                                    <td className="py-1.5">
                                      <ReassignButton
                                        taskId={task.taskId}
                                        currentEmployeeId={row.employeeId}
                                      />
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
// Reassign button (stub — requires tasks.assign permission)
// ---------------------------------------------------------------------------

function ReassignButton({
  taskId,
  currentEmployeeId: _currentEmployeeId,
}: {
  taskId: string;
  currentEmployeeId: string;
}) {
  // Placeholder: routes to the task detail page where reassignment can be done.
  // Full inline reassign dropdown is out of scope for this wave
  // (requires the task mutation API from Agent A).
  return (
    <Link
      href={`/tasks/${taskId}`}
      className="rounded border border-[var(--pf-border)] px-2 py-0.5 text-xs text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-secondary)]"
      onClick={(e) => e.stopPropagation()}
    >
      Open
    </Link>
  );
}
