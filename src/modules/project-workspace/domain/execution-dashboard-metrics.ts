import type { ContractorTaskView } from '@/modules/collaboration';
import { isTerminalExternalStatus } from '@/modules/collaboration/domain/task-lifecycle';
import type { CoordinationEventSummary } from '@/modules/coordination';
import type { DefectStatusCounts } from '@/modules/defects';
import { countMetric, type MetricCount } from './metric-value';

export interface ExecutionDashboardMetrics {
  readonly coordinationUpcoming: MetricCount;
  readonly coordinationBlocked: MetricCount;
  readonly overdueTasks: MetricCount;
  readonly openDefects: MetricCount;
  readonly overdueRfis: MetricCount;
  readonly pendingSubmittals: MetricCount;
  readonly openInspections: MetricCount;
}

export function sumOpenDefects(counts: DefectStatusCounts): number {
  return counts.open + counts.assigned + counts.reopened + counts.awaitingVerification;
}

export function pendingSubmittalReviewCount(counts: {
  readonly submitted: number;
  readonly under_review: number;
}): number {
  return counts.submitted + counts.under_review;
}

/** Upcoming = open events starting now or later; blocked = readiness blocked. */
export function coordinationDashboardCounts(
  items: readonly Pick<CoordinationEventSummary, 'startsAt' | 'readiness'>[],
  now: Date,
): { readonly upcoming: number; readonly blocked: number } {
  const nowMs = now.getTime();
  let upcoming = 0;
  let blocked = 0;
  for (const item of items) {
    if (item.readiness === 'blocked') blocked += 1;
    const startsMs = item.startsAt.getTime();
    if (startsMs >= nowMs) upcoming += 1;
  }
  return { upcoming, blocked };
}

export function overdueContractorTaskCount(tasks: readonly Pick<ContractorTaskView, 'dueDate' | 'status'>[], today: string): number {
  let overdue = 0;
  for (const task of tasks) {
    if (!task.dueDate || task.dueDate >= today) continue;
    if (isTerminalExternalStatus(task.status) || task.status === 'approved') continue;
    overdue += 1;
  }
  return overdue;
}

export function buildExecutionDashboardMetrics(input: {
  readonly coordination: { readonly upcoming: number; readonly blocked: number } | null;
  readonly overdueTasks: number | null;
  readonly defectCounts: DefectStatusCounts | null;
  readonly overdueRfis: number | null;
  readonly pendingSubmittals: number | null;
  readonly openInspections: number | null;
}): ExecutionDashboardMetrics {
  return {
    coordinationUpcoming: countMetric(input.coordination?.upcoming),
    coordinationBlocked: countMetric(input.coordination?.blocked),
    overdueTasks: countMetric(input.overdueTasks),
    openDefects: countMetric(input.defectCounts ? sumOpenDefects(input.defectCounts) : null),
    overdueRfis: countMetric(input.overdueRfis),
    pendingSubmittals: countMetric(input.pendingSubmittals),
    openInspections: countMetric(input.openInspections),
  };
}
