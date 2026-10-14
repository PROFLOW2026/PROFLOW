import { describe, expect, it } from 'vitest';
import { planningSuppressedByLinkedTask } from '@/modules/calendar/domain/planning-dedupe';

describe('planningSuppressedByLinkedTask', () => {
  it('hides planning rows when linked task due date is in range', () => {
    expect(
      planningSuppressedByLinkedTask(
        { taskId: 't1', linkedTaskDueDate: '2026-03-12', linkedTaskStatus: 'todo' },
        { from: '2026-03-01', to: '2026-03-31' },
      ),
    ).toBe(true);
  });

  it('keeps planning rows when linked task is outside the range', () => {
    expect(
      planningSuppressedByLinkedTask(
        { taskId: 't1', linkedTaskDueDate: '2026-04-02', linkedTaskStatus: 'todo' },
        { from: '2026-03-01', to: '2026-03-31' },
      ),
    ).toBe(false);
  });
});
