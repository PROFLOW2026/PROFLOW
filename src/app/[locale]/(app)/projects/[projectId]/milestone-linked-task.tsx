'use client';

/**
 * MilestoneLinkedTask — shows the linked task on a milestone card,
 * with a status badge and an unlink/link selector.
 *
 * Used inside MilestonesPanel (overview tab) when canEdit=true.
 * All writes go through linkTaskToMilestoneAction.
 */

import { useTransition, useState } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StatusShape } from '@/components/ui/status-badge';
import type { linkTaskToMilestoneAction } from './milestone-link-actions';

export interface LinkedTaskSummary {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

export interface ProjectTaskOption {
  id: string;
  title: string;
  status: string;
}

interface MilestoneLinkedTaskProps {
  milestoneId: string;
  projectId: string;
  linkedTask: LinkedTaskSummary | null;
  /** All non-archived tasks in the project for the selector. */
  projectTasks: readonly ProjectTaskOption[];
  canEdit: boolean;
  linkAction: typeof linkTaskToMilestoneAction;
}

function taskStatusShape(status: string): StatusShape {
  switch (status) {
    case 'done':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'blocked':
      return 'overdue';
    case 'in_review':
    case 'in_progress':
      return 'active';
    default:
      return 'pending';
  }
}

export function MilestoneLinkedTask({
  milestoneId,
  projectId,
  linkedTask,
  projectTasks,
  canEdit,
  linkAction,
}: MilestoneLinkedTaskProps) {
  const [, startTransition] = useTransition();
  const [showSelector, setShowSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLink(taskId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await linkAction(taskId ?? '', taskId ? milestoneId : null, projectId);
      if (result.error) setError(result.error);
      else setShowSelector(false);
    });
  }

  // Tasks not yet linked to another milestone (or linked to this milestone)
  const availableTasks = projectTasks.filter(
    (t) => t.id === linkedTask?.id || t.status !== 'done' && t.status !== 'cancelled',
  );

  return (
    <div className="mt-1 flex flex-col gap-1 border-t border-[var(--pf-border-default)] pt-1">
      {linkedTask ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--pf-text-secondary)]">Linked task:</span>
          <span className="font-medium text-[var(--pf-text-primary)]">{linkedTask.title}</span>
          <StatusBadge shape={taskStatusShape(linkedTask.status)} label={linkedTask.status} />
          {linkedTask.dueDate ? (
            <span className="text-[var(--pf-text-secondary)]">Due {linkedTask.dueDate}</span>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => handleLink(null)}
              className="text-xs text-[var(--pf-status-danger-fg)] hover:underline"
            >
              Unlink
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--pf-text-secondary)]">No linked task</p>
      )}

      {canEdit && !showSelector && (
        <button
          type="button"
          onClick={() => setShowSelector(true)}
          className="w-fit text-xs text-[var(--pf-status-info-fg)] hover:underline"
        >
          {linkedTask ? 'Change linked task' : 'Link a task'}
        </button>
      )}

      {showSelector && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs text-[var(--pf-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--pf-status-info-fg)]"
            onChange={(e) => {
              if (e.target.value) handleLink(e.target.value);
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Select task…
            </option>
            {availableTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowSelector(false)}
            className="text-xs text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]"
          >
            Cancel
          </button>
        </div>
      )}

      {error ? <p className="text-xs text-[var(--pf-status-danger-fg)]">{error}</p> : null}
    </div>
  );
}
