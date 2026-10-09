import { describe, expect, it } from 'vitest';
import { dedupeCommandCenterItems } from '@/modules/command-center/domain/dedupe-command-center-items';
import { withItemDefaults } from '@/modules/command-center/domain/ranking';
import type { CommandCenterItem } from '@/modules/command-center/domain/types';

function item(
  partial: Pick<CommandCenterItem, 'sourceType' | 'sourceId'> & Partial<CommandCenterItem>,
): CommandCenterItem {
  return withItemDefaults({
    what: partial.what ?? 'What',
    why: partial.why ?? 'Why',
    where: partial.where ?? 'Where',
    href: partial.href ?? '/',
    ...partial,
  });
}

describe('dedupeCommandCenterItems', () => {
  it('D1 drops overdue_planning when the linked task is overdue for the user', () => {
    const taskId = 'task-1';
    const planningId = 'plan-1';
    const items = [
      item({
        sourceType: 'overdue_planning',
        sourceId: planningId,
        href: '/projects/p1?tab=schedule',
        meta: { scheduleLinkedTaskId: taskId },
      }),
      item({
        sourceType: 'task_overdue',
        sourceId: taskId,
        href: `/tasks/${taskId}`,
      }),
    ];

    const result = dedupeCommandCenterItems(items);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceType).toBe('task_overdue');
    expect(result[0]?.meta?.scheduleWorkItemId).toBe(planningId);
    expect(result[0]?.meta?.scheduleLinkedTaskId).toBe(taskId);
  });

  it('D1 keeps overdue_planning when no matching task_overdue/task_due_today row exists', () => {
    const items = [
      item({
        sourceType: 'overdue_planning',
        sourceId: 'plan-1',
        meta: { scheduleLinkedTaskId: 'task-1' },
      }),
    ];

    const result = dedupeCommandCenterItems(items);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceType).toBe('overdue_planning');
  });

  it('D1 dedupes against task_due_today as well as task_overdue', () => {
    const taskId = 'task-2';
    const items = [
      item({
        sourceType: 'overdue_planning',
        sourceId: 'plan-2',
        meta: { scheduleLinkedTaskId: taskId },
      }),
      item({
        sourceType: 'task_due_today',
        sourceId: taskId,
        href: `/tasks/${taskId}`,
      }),
    ];

    const result = dedupeCommandCenterItems(items);

    expect(result.map((i) => i.sourceType)).toEqual(['task_due_today']);
  });

  it('D3 drops open_approval for tasks when task_approval_requested exists for same approval', () => {
    const approvalId = 'appr-1';
    const items = [
      item({
        sourceType: 'open_approval',
        sourceId: approvalId,
        meta: { entityType: 'task', entityId: 'task-9' },
      }),
      item({
        sourceType: 'task_approval_requested',
        sourceId: approvalId,
        href: '/tasks/task-9?tab=approvals',
        meta: { taskId: 'task-9' },
      }),
    ];

    const result = dedupeCommandCenterItems(items);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceType).toBe('task_approval_requested');
  });

  it('D3 keeps open_approval for non-task entities', () => {
    const approvalId = 'appr-2';
    const items = [
      item({
        sourceType: 'open_approval',
        sourceId: approvalId,
        meta: { entityType: 'expense', entityId: 'exp-1' },
      }),
      item({
        sourceType: 'task_approval_requested',
        sourceId: 'other-approval',
      }),
    ];

    const result = dedupeCommandCenterItems(items);

    expect(result.some((i) => i.sourceType === 'open_approval')).toBe(true);
  });
});
