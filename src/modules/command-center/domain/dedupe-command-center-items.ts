import type { CommandCenterItem } from './types';

/**
 * Post-collect presentation dedupe (PM-011 / WP-E).
 * Does not merge data — only suppresses duplicate Today rows when two lenses
 * surface the same actionable work.
 */
export function dedupeCommandCenterItems(items: readonly CommandCenterItem[]): CommandCenterItem[] {
  const taskApprovalIds = new Set<string>();
  const visibleTaskIds = new Set<string>();
  for (const item of items) {
    if (item.sourceType === 'task_approval_requested') {
      taskApprovalIds.add(item.sourceId);
    }
    if (item.sourceType === 'task_overdue' || item.sourceType === 'task_due_today') {
      visibleTaskIds.add(item.sourceId);
    }
  }

  const droppedPlanningByTaskId = new Map<string, CommandCenterItem>();
  const result: CommandCenterItem[] = [];

  for (const item of items) {
    if (item.sourceType === 'open_approval') {
      const entityType = item.meta?.entityType;
      if (entityType === 'task' && taskApprovalIds.has(item.sourceId)) {
        continue;
      }
    }

    if (item.sourceType === 'overdue_planning') {
      const linkedTaskId = planningLinkedTaskId(item);
      if (linkedTaskId && visibleTaskIds.has(linkedTaskId)) {
        droppedPlanningByTaskId.set(linkedTaskId, item);
        continue;
      }
    }

    result.push(item);
  }

  if (droppedPlanningByTaskId.size === 0) {
    return result;
  }

  return result.map((item) => {
    if (item.sourceType !== 'task_overdue' && item.sourceType !== 'task_due_today') {
      return item;
    }
    const planning = droppedPlanningByTaskId.get(item.sourceId);
    if (!planning) return item;
    return {
      ...item,
      meta: {
        ...item.meta,
        scheduleLinkedTaskId: item.sourceId,
        scheduleWorkItemId: planning.sourceId,
      },
    };
  });
}

function planningLinkedTaskId(item: CommandCenterItem): string | null {
  const fromMeta = item.meta?.scheduleLinkedTaskId ?? item.meta?.linkedTaskId;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  return null;
}
