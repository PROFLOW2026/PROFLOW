import { describe, expect, it } from 'vitest';
import { filterTaskCardsByWorkLens } from '@/modules/tasks/domain/filter-task-card-by-work-lens';
import { parseWorkTaskListFilters } from '@/modules/tasks/domain/work-task-search-params';
import type { TaskCardData } from '@/modules/tasks/ui/task-api';

function card(partial: Partial<TaskCardData> & Pick<TaskCardData, 'id' | 'title'>): TaskCardData {
  return {
    id: partial.id,
    title: partial.title,
    description: null,
    status: partial.status ?? 'todo',
    priority: partial.priority ?? 'medium',
    bucketId: null,
    bucketName: null,
    sortKey: partial.id,
    assignees: partial.assignees ?? [],
    startDate: null,
    dueDate: partial.dueDate ?? null,
    estimatedEffortMinutes: null,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    isBlocked: false,
    approvalRequired: false,
    projectId: partial.projectId ?? null,
    projectName: null,
    workspaceId: 'ws-1',
    workspaceName: null,
    boardId: null,
    boardName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('My Work URL filters', () => {
  it('applies /work?view=today&priority=urgent style params on loaded cards', () => {
    const filters = parseWorkTaskListFilters({
      view: 'today',
      priority: 'urgent',
    });

    const tasks = [
      card({ id: 'a', title: 'A', priority: 'urgent' }),
      card({ id: 'b', title: 'B', priority: 'low' }),
    ];

    const visible = filterTaskCardsByWorkLens(tasks, filters);
    expect(visible.map((t) => t.id)).toEqual(['a']);
  });
});
