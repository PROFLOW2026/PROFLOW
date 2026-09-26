/**
 * Derived project progress from opt-in tasks.
 *
 * Manual `projects.progress_percent` is untouched. Callers show this number
 * only when `progress_source = 'tasks'`.
 *
 * Cancelled and archived tasks are ignored.
 * A null weight counts as 1.
 * Only status `done` earns the weight. Other open statuses earn 0.
 * Returns null when no contributing task remains.
 */

export interface ProgressTaskInput {
  readonly status: string;
  readonly contributesToProgress: boolean;
  readonly progressWeight: string | number | null;
  readonly isArchived?: boolean;
}

export interface DerivedProjectProgress {
  readonly percent: number | null;
  readonly contributingCount: number;
  readonly doneCount: number;
}

function weightOf(task: ProgressTaskInput): number {
  if (task.progressWeight == null || task.progressWeight === '') return 1;
  const value = typeof task.progressWeight === 'number' ? task.progressWeight : Number(task.progressWeight);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function deriveProjectProgress(tasks: readonly ProgressTaskInput[]): DerivedProjectProgress {
  const contributing = tasks.filter(
    (task) => task.contributesToProgress && !task.isArchived && task.status !== 'cancelled',
  );
  const total = contributing.reduce((sum, task) => sum + weightOf(task), 0);
  if (contributing.length === 0 || total <= 0) {
    return { percent: null, contributingCount: contributing.length, doneCount: 0 };
  }
  const done = contributing.filter((task) => task.status === 'done');
  const earned = done.reduce((sum, task) => sum + weightOf(task), 0);
  const percent = Math.round((earned / total) * 1000) / 10;
  return {
    percent: Math.min(100, Math.max(0, percent)),
    contributingCount: contributing.length,
    doneCount: done.length,
  };
}
