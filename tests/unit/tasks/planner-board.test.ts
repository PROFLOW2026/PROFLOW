import { describe, expect, it, vi } from 'vitest';
import { isValidTransition } from '@/modules/tasks/domain/lifecycle';
import {
  clampTaskListLimit,
  splitTaskListPage,
  TASK_LIST_DEFAULT_LIMIT,
  TASK_LIST_MAX_LIMIT,
} from '@/modules/tasks/domain/list-window';
import { buildOccurrenceReminderCopies } from '@/modules/tasks/application/process-recurrence-occurrences';
import { listTasksPage } from '@/modules/tasks/data/tasks.repository';
import { queryMyWork } from '@/modules/tasks/data/my-work.repository';
import { mapTaskToCardData } from '@/modules/tasks/ui/_task-api-stub';
import type { Task } from '@/modules/tasks/domain/types';

function taskRow(id: string) {
  return {
    id,
    title: id,
    status: 'todo',
    priority: 'none',
    sortKey: id,
    source: 'manual',
    createdBySystem: false,
    approvalRequired: false,
    isArchived: false,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

function selectChain(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select }, limit };
}

describe('planner board list window', () => {
  it('keeps the default page at 50 and allows an explicit 500', () => {
    expect(clampTaskListLimit(undefined)).toBe(TASK_LIST_DEFAULT_LIMIT);
    expect(clampTaskListLimit(500)).toBe(500);
    expect(clampTaskListLimit(900)).toBe(TASK_LIST_MAX_LIMIT);
  });

  it('signals hasMore only when the extra row was fetched', () => {
    expect(splitTaskListPage(['a', 'b'], 2).hasMore).toBe(false);
    expect(splitTaskListPage(['a', 'b', 'c'], 2)).toEqual({ items: ['a', 'b'], hasMore: true });
  });

  it('requests limit+1 so an explicit 500 is not clamped to 200', async () => {
    const { db, limit } = selectChain([taskRow('a'), taskRow('b')]);
    const page = await listTasksPage(db as never, 'org-1', ['ws-1'], { limit: 500 });
    expect(limit).toHaveBeenCalledWith(501);
    expect(page.hasMore).toBe(false);
    expect(page.tasks).toHaveLength(2);

    const truncated = selectChain([taskRow('a'), taskRow('b')]);
    const short = await listTasksPage(truncated.db as never, 'org-1', ['ws-1'], { limit: 1 });
    expect(truncated.limit).toHaveBeenCalledWith(2);
    expect(short.hasMore).toBe(true);
    expect(short.tasks).toHaveLength(1);
  });
});

describe('global board status moves', () => {
  it('rejects blocked to done and allows todo to in progress', () => {
    expect(isValidTransition('blocked', 'done')).toBe(false);
    expect(isValidTransition('todo', 'in_progress')).toBe(true);
    expect(isValidTransition('todo', 'todo')).toBe(false);
  });
});

describe('occurrence reminder copies', () => {
  it('recomputes on_due and day_before and skips custom reminders', () => {
    const copies = buildOccurrenceReminderCopies(
      [{ reminderType: 'on_due' }, { reminderType: 'day_before' }, { reminderType: 'custom' }],
      '2026-10-01',
      'Asia/Jerusalem',
    );
    expect(copies.map((copy) => copy.reminderType)).toEqual(['on_due', 'day_before']);
    const onDue = copies.find((copy) => copy.reminderType === 'on_due')!;
    const dayBefore = copies.find((copy) => copy.reminderType === 'day_before')!;
    expect(dayBefore.remindAt.getTime()).toBeLessThan(onDue.remindAt.getTime());
  });
});

describe('office tasks', () => {
  it('loads the no-project view with a truncation probe', async () => {
    const { db, limit } = selectChain([taskRow('office-1')]);
    const tasks = await queryMyWork(db as never, {
      orgMemberId: 'mem-1',
      organizationId: 'org-1',
      workspaceIds: ['ws-1'],
      view: 'no_project',
      limit: 100,
    });
    expect(limit).toHaveBeenCalledWith(101);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.projectId ?? null).toBeNull();
  });

  it('maps client name from enrichment and leaves office tasks unlabeled', () => {
    const projectTask = {
      id: 't1',
      projectId: 'p1',
      title: 'Pour',
      status: 'todo',
      priority: 'medium',
      workspaceId: 'ws',
      sortKey: 'a',
      approvalRequired: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task;
    expect(mapTaskToCardData(projectTask, { clientName: 'Acme', projectName: 'Tower' }).clientName).toBe(
      'Acme',
    );
    expect(
      mapTaskToCardData({ ...projectTask, projectId: null }, { clientName: null }).clientName,
    ).toBeNull();
  });
});
