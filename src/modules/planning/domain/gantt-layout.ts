/**
 * Build a simple Gantt model for CSS/SVG rendering.
 * Shows planned timeline, overdue bars, dependency edges, progress, milestones.
 */

import {
  calendarDaysBetween,
  inclusiveDurationDays,
  isIsoDate,
  maxIsoDate,
  minIsoDate,
} from './dates';
import { detectWorkItemOverdue } from './overdue';
import type {
  GanttBar,
  GanttModel,
  IsoDate,
  PlanningDependency,
  PlanningWorkItem,
} from './types';

function resolveBarDates(item: PlanningWorkItem): {
  start: IsoDate | null;
  end: IsoDate | null;
} {
  if (item.kind === 'milestone') {
    const marker = item.targetEndDate ?? item.startDate;
    return { start: marker, end: marker };
  }
  const start = item.startDate;
  const end = item.targetEndDate ?? item.startDate;
  return { start, end };
}

export function buildGanttModel(input: {
  readonly workItems: readonly PlanningWorkItem[];
  readonly dependencies: readonly PlanningDependency[];
  readonly today: IsoDate;
  /** Optional pad days on each side of the computed range. */
  readonly padDays?: number;
}): GanttModel | null {
  const active = input.workItems
    .filter((item) => !item.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const datePool: IsoDate[] = [];
  for (const item of active) {
    const { start, end } = resolveBarDates(item);
    if (start && isIsoDate(start)) datePool.push(start);
    if (end && isIsoDate(end)) datePool.push(end);
  }
  if (datePool.length === 0) return null;

  const pad = input.padDays ?? 1;
  let timelineStart = minIsoDate(datePool)!;
  let timelineEnd = maxIsoDate(datePool)!;

  // Expand by pad using calendar arithmetic via offsets after we know start.
  const startMs = new Date(`${timelineStart}T12:00:00.000Z`);
  startMs.setUTCDate(startMs.getUTCDate() - pad);
  const endMs = new Date(`${timelineEnd}T12:00:00.000Z`);
  endMs.setUTCDate(endMs.getUTCDate() + pad);
  timelineStart = startMs.toISOString().slice(0, 10);
  timelineEnd = endMs.toISOString().slice(0, 10);

  const totalDays = Math.max(1, calendarDaysBetween(timelineStart, timelineEnd) + 1);

  const predsBySuccessor = new Map<string, string[]>();
  for (const edge of input.dependencies) {
    const list = predsBySuccessor.get(edge.successorId) ?? [];
    list.push(edge.predecessorId);
    predsBySuccessor.set(edge.successorId, list);
  }

  const bars: GanttBar[] = [];
  for (const item of active) {
    const { start, end } = resolveBarDates(item);
    if (!start || !end) continue;
    const isMilestone = item.kind === 'milestone';
    const startOffsetDays = calendarDaysBetween(timelineStart, start);
    const durationDays = inclusiveDurationDays(start, end, isMilestone);
    const overdue = detectWorkItemOverdue(item, input.today).overdue;

    bars.push({
      workItemId: item.id,
      name: item.name,
      kind: item.kind,
      startOffsetDays,
      durationDays: isMilestone ? 0 : durationDays,
      progressPercent: item.progressPercent,
      overdue,
      isMilestone,
      phaseId: item.phaseId,
      workPackageId: item.workPackageId,
      predecessorIds: predsBySuccessor.get(item.id) ?? [],
    });
  }

  const todayOffsetDays =
    input.today >= timelineStart && input.today <= timelineEnd
      ? calendarDaysBetween(timelineStart, input.today)
      : null;

  return {
    timelineStart,
    timelineEnd,
    totalDays,
    bars,
    dependencyEdges: input.dependencies.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
    })),
    todayOffsetDays,
  };
}
