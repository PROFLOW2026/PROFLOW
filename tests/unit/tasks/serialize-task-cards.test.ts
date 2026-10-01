import { describe, expect, it } from 'vitest';
import { serializeTaskCardsForClient } from '@/modules/tasks/ui/serialize-task-cards';
import type { TaskCardData } from '@/modules/tasks/ui/_task-api-stub';

describe('serializeTaskCardsForClient', () => {
  it('coerces dates and nested fields for RSC props', () => {
    const task = {
      id: 't1',
      title: 'Task',
      description: null,
      status: 'todo',
      priority: 'medium',
      bucketId: null,
      bucketName: null,
      sortKey: 'a',
      assignees: [{ id: 'm1', displayName: 'Ada', avatarUrl: null }],
      startDate: null,
      dueDate: '2026-01-01',
      labels: ['a'],
      checklistTotal: 0,
      checklistDone: 0,
      isBlocked: false,
      approvalRequired: false,
      progressWeight: 1.5 as unknown as string,
      projectId: null,
      projectName: null,
      clientName: null,
      workspaceId: 'w1',
      workspaceName: null,
      boardId: null,
      boardName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    } satisfies TaskCardData;

    const serialized = serializeTaskCardsForClient([
      {
        ...task,
        createdAt: new Date('2026-01-01T00:00:00.000Z') as unknown as string,
        updatedAt: new Date('2026-01-02T00:00:00.000Z') as unknown as string,
      },
    ])[0]!;
    expect(serialized.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(serialized.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(serialized.progressWeight).toBe('1.5');
    expect(serialized.assignees[0]?.avatarUrl).toBeNull();
    expect(JSON.stringify(serialized)).not.toContain('undefined');
  });
});
