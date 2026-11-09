/**
 * Planning V1 - work items, dependencies, milestones (doc 22 Layer A+).
 * Framework-free. Persistence lands via Lead SCHEMA_REQUEST → 0020+.
 */

export const PLANNING_DEPENDENCY_TYPES = ['finish_to_start'] as const;
export type PlanningDependencyType = (typeof PLANNING_DEPENDENCY_TYPES)[number];

export const PLANNING_WORK_ITEM_KINDS = ['task', 'milestone'] as const;
export type PlanningWorkItemKind = (typeof PLANNING_WORK_ITEM_KINDS)[number];

/** ISO calendar date `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * A schedulable row on a project plan.
 * Links optionally to existing Phase / WorkPackage (תחום עבודה) rows.
 */
export interface PlanningWorkItem {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly name: string;
  readonly kind: PlanningWorkItemKind;
  /** Planned start (null for pure milestones that only have a target). */
  readonly startDate: IsoDate | null;
  /** Planned / target finish. For milestones this is the milestone date. */
  readonly targetEndDate: IsoDate | null;
  readonly actualEndDate: IsoDate | null;
  /** 0–100; milestones are typically 0 or 100. */
  readonly progressPercent: number;
  /** Optional link to `phases.id`. */
  readonly phaseId: string | null;
  /** Optional link to `work_packages.id` (work area / תחום עבודה). */
  readonly workPackageId: string | null;
  /** Optional link to UWM `tasks.id` (migration 0110). No automatic date/status sync. */
  readonly taskId: string | null;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Predecessor edge: `successorId` cannot finish before predecessor finishes (FS). */
export interface PlanningDependency {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly type: PlanningDependencyType;
  readonly createdAt: Date;
}

export interface PlanningPlanSnapshot {
  readonly organizationId: string;
  readonly projectId: string;
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
}

export interface PlanningOverdueFlags {
  readonly workItemId: string;
  readonly overdue: boolean;
  readonly reason: 'past_target_incomplete' | 'milestone_missed' | null;
}

export interface GanttBar {
  readonly workItemId: string;
  readonly name: string;
  readonly kind: PlanningWorkItemKind;
  /** Inclusive day offset from timeline start. */
  readonly startOffsetDays: number;
  /** Duration in days (≥ 1 for tasks; 0 width marker for milestones). */
  readonly durationDays: number;
  readonly progressPercent: number;
  readonly overdue: boolean;
  readonly isMilestone: boolean;
  readonly phaseId: string | null;
  readonly workPackageId: string | null;
  readonly predecessorIds: readonly string[];
}

export interface GanttModel {
  readonly timelineStart: IsoDate;
  readonly timelineEnd: IsoDate;
  readonly totalDays: number;
  readonly bars: readonly GanttBar[];
  /** successorId → predecessorIds for drawing dependency chains. */
  readonly dependencyEdges: readonly {
    readonly predecessorId: string;
    readonly successorId: string;
  }[];
  readonly todayOffsetDays: number | null;
}

export type CriticalPathLimitationKey =
  | 'planning.criticalPath.unsafe'
  | 'planning.criticalPath.missingDates';

/** CPM could not be computed (cycle, missing dates, or validation failure). */
export interface CriticalPathFoundationUnsupported {
  readonly supported: false;
  readonly limitationKey: CriticalPathLimitationKey;
  /** Topological order of work-item ids when the graph is acyclic. */
  readonly topologicalOrder: readonly string[];
  /**
   * Longest path by calendar-day duration (heuristic only).
   * Empty when graph has a cycle or no dated items.
   */
  readonly heuristicLongestPathIds: readonly string[];
}

/** FS-network CPM with simplified 7-day calendar (see LIMITATION.md). */
export interface CriticalPathFoundationSupported {
  readonly supported: true;
  readonly topologicalOrder: readonly string[];
  readonly criticalPathIds: readonly string[];
  readonly floatByWorkItemId: Readonly<Record<string, number>>;
  readonly earlyStartByWorkItemId: Readonly<Record<string, number>>;
  readonly earlyFinishByWorkItemId: Readonly<Record<string, number>>;
  readonly lateStartByWorkItemId: Readonly<Record<string, number>>;
  readonly lateFinishByWorkItemId: Readonly<Record<string, number>>;
}

export type CriticalPathFoundation =
  | CriticalPathFoundationUnsupported
  | CriticalPathFoundationSupported;
