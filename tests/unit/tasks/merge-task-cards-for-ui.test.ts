import { describe, expect, it } from 'vitest';
import { mergeTaskCardsById } from '@/modules/tasks/application/merge-task-cards-for-ui';
import type { TaskCardData } from '@/modules/tasks/ui/task-api';

function card(id: string): TaskCardData {
  return {
    id,
    title: id,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    startDate: null,
    projectId: null,
    projectName: null,
    bucketId: null,
    bucketName: null,
    boardId: null,
    workspaceId: 'w',
    workspaceName: null,
    assignees: [],
    labels: [],
    sortKey: 'a',
    checklistTotal: 0,
    checklistDone: 0,
    isBlocked: false,
    approvalRequired: false,
    description: null,
    estimatedEffortMinutes: null,
    boardName: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

describe('mergeTaskCardsById', () => {
  it('appends new ids without duplicates', () => {
    const merged = mergeTaskCardsById([card('a'), card('b')], [card('b'), card('c')]);
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
