/**
 * Overdue detection for planning work items.
 * Incomplete items past target end (or milestones past target) are overdue.
 */

import type { IsoDate, PlanningOverdueFlags, PlanningWorkItem } from './types';

type OverdueFields = Pick<
  PlanningWorkItem,
  'kind' | 'targetEndDate' | 'actualEndDate' | 'progressPercent' | 'archivedAt'
>;

function overdueReason(
  item: OverdueFields,
  today: IsoDate,
): PlanningOverdueFlags['reason'] {
  if (item.archivedAt) return null;
  if (item.actualEndDate) return null;
  if (!item.targetEndDate) return null;
  if (item.targetEndDate >= today) return null;
  if (item.kind === 'milestone') return 'milestone_missed';
  if (item.progressPercent >= 100) return null;
  return 'past_target_incomplete';
}

export function isWorkItemOverdue(item: OverdueFields, today: IsoDate): boolean {
  return overdueReason(item, today) != null;
}

export function detectWorkItemOverdue(
  item: OverdueFields & Pick<PlanningWorkItem, 'id'>,
  today: IsoDate,
): PlanningOverdueFlags {
  const reason = overdueReason(item, today);
  return { workItemId: item.id, overdue: reason != null, reason };
}

export function listOverdueWorkItems(
  items: readonly Pick<
    PlanningWorkItem,
    'id' | 'kind' | 'targetEndDate' | 'actualEndDate' | 'progressPercent' | 'archivedAt'
  >[],
  today: IsoDate,
): readonly PlanningOverdueFlags[] {
  return items.map((item) => detectWorkItemOverdue(item, today)).filter((flag) => flag.overdue);
}

export function countOverdueWorkItems(
  items: readonly Pick<
    PlanningWorkItem,
    'id' | 'kind' | 'targetEndDate' | 'actualEndDate' | 'progressPercent' | 'archivedAt'
  >[],
  today: IsoDate,
): number {
  return listOverdueWorkItems(items, today).length;
}
