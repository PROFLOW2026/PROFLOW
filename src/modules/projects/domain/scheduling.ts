/**
 * Light scheduling (doc 22 Layer A) — dates, progress, overdue, summary.
 * No Gantt / critical path. No notification delivery.
 */

import type {
  MilestoneRecord,
  PhaseRecord,
  ProgressStatus,
  ProjectRecord,
  WorkPackageRecord,
} from './types';

export const DATE_ORDER_MESSAGE = 'validation.endBeforeStart';

/** True when both ends exist and end is strictly before start. */
export function isEndBeforeStart(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  if (!startDate || !endDate) return false;
  return endDate < startDate;
}

export function parseProgressPercent(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Average progress across active packages that have a percent set.
 * Returns null when nothing is reported (caller keeps project-level %).
 */
export function rollupWorkPackageProgress(
  packages: readonly Pick<WorkPackageRecord, 'progressPercent' | 'archivedAt'>[],
): number | null {
  const values: number[] = [];
  for (const pkg of packages) {
    if (pkg.archivedAt) continue;
    const percent = parseProgressPercent(pkg.progressPercent);
    if (percent != null) values.push(percent);
  }
  if (values.length === 0) return null;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/** Prefer explicit project progress; else WP rollup. */
export function resolveProjectProgressPercent(
  project: Pick<ProjectRecord, 'progressPercent'>,
  packages: readonly Pick<WorkPackageRecord, 'progressPercent' | 'archivedAt'>[],
): number | null {
  const direct = parseProgressPercent(project.progressPercent);
  if (direct != null) return direct;
  return rollupWorkPackageProgress(packages);
}

const CLOSED_PROJECT_STATUSES = new Set(['completed', 'cancelled', 'archived']);

export function isProjectTargetOverdue(
  project: Pick<ProjectRecord, 'status' | 'targetEndDate' | 'actualEndDate'>,
  today: string,
): boolean {
  if (CLOSED_PROJECT_STATUSES.has(project.status)) return false;
  if (project.actualEndDate) return false;
  if (!project.targetEndDate) return false;
  return project.targetEndDate < today;
}

export function isMilestoneOverdue(
  milestone: Pick<MilestoneRecord, 'status' | 'targetDate' | 'archivedAt'>,
  today: string,
): boolean {
  if (milestone.archivedAt) return false;
  if (milestone.status !== 'planned') return false;
  if (!milestone.targetDate) return false;
  return milestone.targetDate < today;
}

export function isWorkPackageOverdue(
  pkg: Pick<WorkPackageRecord, 'endDate' | 'progressPercent' | 'archivedAt'>,
  today: string,
): boolean {
  if (pkg.archivedAt) return false;
  if (!pkg.endDate) return false;
  const progress = parseProgressPercent(pkg.progressPercent);
  if (progress != null && progress >= 100) return false;
  return pkg.endDate < today;
}

export function isPhaseOverdue(
  phase: Pick<PhaseRecord, 'endDate' | 'archivedAt'>,
  today: string,
): boolean {
  if (phase.archivedAt) return false;
  if (!phase.endDate) return false;
  return phase.endDate < today;
}

/** Compact progress line for reports / overview (doc 22 Layer A). */
export interface ProgressReportLine {
  readonly progressPercent: number | null;
  readonly progressStatus: ProgressStatus | null;
  readonly projectOverdue: boolean;
  readonly overdueMilestoneCount: number;
  readonly overdueWorkPackageCount: number;
  readonly achievedMilestoneCount: number;
  readonly milestoneCount: number;
}

export function toProgressReportLine(summary: ScheduleSummary): ProgressReportLine {
  return {
    progressPercent: summary.progressPercent,
    progressStatus: summary.progressStatus,
    projectOverdue: summary.projectOverdue,
    overdueMilestoneCount: summary.overdueMilestoneCount,
    overdueWorkPackageCount: summary.overdueWorkPackageCount,
    achievedMilestoneCount: summary.achievedMilestoneCount,
    milestoneCount: summary.milestoneCount,
  };
}

export interface ScheduleSummary {
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
  readonly actualEndDate: string | null;
  readonly progressPercent: number | null;
  readonly progressStatus: ProgressStatus | null;
  readonly projectOverdue: boolean;
  readonly overdueMilestoneCount: number;
  readonly overdueWorkPackageCount: number;
  readonly overduePhaseCount: number;
  readonly nextMilestone: {
    readonly id: string;
    readonly name: string;
    readonly targetDate: string | null;
    readonly overdue: boolean;
  } | null;
  readonly milestoneCount: number;
  readonly achievedMilestoneCount: number;
}

export function buildScheduleSummary(input: {
  readonly project: Pick<
    ProjectRecord,
    | 'status'
    | 'startDate'
    | 'targetEndDate'
    | 'actualEndDate'
    | 'progressPercent'
    | 'progressStatus'
  >;
  readonly workPackages: readonly Pick<
    WorkPackageRecord,
    'endDate' | 'progressPercent' | 'archivedAt'
  >[];
  readonly milestones: readonly Pick<
    MilestoneRecord,
    'id' | 'name' | 'targetDate' | 'status' | 'archivedAt' | 'sortOrder'
  >[];
  readonly phases?: readonly Pick<PhaseRecord, 'endDate' | 'archivedAt'>[];
  readonly today: string;
}): ScheduleSummary {
  const activeMilestones = input.milestones.filter((m) => !m.archivedAt);
  const overdueMilestones = activeMilestones.filter((m) => isMilestoneOverdue(m, input.today));
  const achievedMilestoneCount = activeMilestones.filter((m) => m.status === 'achieved').length;

  const upcoming = activeMilestones
    .filter((m) => m.status === 'planned')
    .slice()
    .sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return a.sortOrder - b.sortOrder;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    });

  const next = upcoming[0] ?? null;
  const phases = input.phases ?? [];

  return {
    startDate: input.project.startDate,
    targetEndDate: input.project.targetEndDate,
    actualEndDate: input.project.actualEndDate,
    progressPercent: resolveProjectProgressPercent(input.project, input.workPackages),
    progressStatus: input.project.progressStatus,
    projectOverdue: isProjectTargetOverdue(input.project, input.today),
    overdueMilestoneCount: overdueMilestones.length,
    overdueWorkPackageCount: input.workPackages.filter((pkg) =>
      isWorkPackageOverdue(pkg, input.today),
    ).length,
    overduePhaseCount: phases.filter((phase) => isPhaseOverdue(phase, input.today)).length,
    nextMilestone: next
      ? {
          id: next.id,
          name: next.name,
          targetDate: next.targetDate,
          overdue: isMilestoneOverdue(next, input.today),
        }
      : null,
    milestoneCount: activeMilestones.length,
    achievedMilestoneCount,
  };
}
