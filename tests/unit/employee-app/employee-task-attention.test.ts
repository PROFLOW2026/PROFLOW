import { describe, expect, it } from 'vitest';
import { buildEmployeeTaskAttentionItems } from '@/modules/employee-app/domain/employee-task-attention';

const TODAY = '2026-09-25';

describe('employee task attention', () => {
  it('lists overdue, due today, and fired reminders on the employee route', () => {
    const items = buildEmployeeTaskAttentionItems({
      today: TODAY,
      reminderTaskIds: new Set(['soon', 'late']),
      tasks: [
        { id: 'late', title: 'Late', dueDate: '2026-09-20', status: 'todo', projectLabel: 'A' },
        { id: 'today', title: 'Today', dueDate: TODAY, status: 'in_progress', projectLabel: null },
        { id: 'soon', title: 'Soon', dueDate: '2026-09-28', status: 'todo', projectLabel: 'B' },
        { id: 'done', title: 'Done', dueDate: '2026-09-01', status: 'done', projectLabel: null },
        { id: 'later', title: 'Later', dueDate: '2026-10-01', status: 'todo', projectLabel: null },
      ],
    });

    expect(items.map((item) => [item.kind, item.taskId, item.href])).toEqual([
      ['overdue', 'late', '/employee/tasks/late'],
      ['dueToday', 'today', '/employee/tasks/today'],
      ['reminder', 'soon', '/employee/tasks/soon'],
    ]);
  });

  it('does not repeat an overdue task as a reminder', () => {
    const items = buildEmployeeTaskAttentionItems({
      today: TODAY,
      reminderTaskIds: new Set(['late']),
      tasks: [{ id: 'late', title: 'Late', dueDate: '2026-09-01', status: 'blocked' }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('overdue');
  });
});
