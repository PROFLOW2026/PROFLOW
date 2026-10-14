import { describe, expect, it } from 'vitest';
import { planningSuppressedByLinkedTask } from '@/modules/calendar/domain/planning-dedupe';

describe('planning dedupe when linked task is done', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };

  it('does not suppress planning when linked task is done', () => {
    expect(
      planningSuppressedByLinkedTask(
        {
          taskId: 'task-1',
          linkedTaskDueDate: '2026-10-15',
          linkedTaskStatus: 'done',
        },
        range,
      ),
    ).toBe(false);
  });

  it('suppresses planning when linked open task due is in range', () => {
    expect(
      planningSuppressedByLinkedTask(
        {
          taskId: 'task-1',
          linkedTaskDueDate: '2026-10-15',
          linkedTaskStatus: 'todo',
        },
        range,
      ),
    ).toBe(true);
  });
});
