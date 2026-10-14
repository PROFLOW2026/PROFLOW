import { describe, expect, it } from 'vitest';
import { mapTaskCardToGanttWorkItem } from '@/modules/tasks/domain/task-gantt-source';

describe('task gantt source', () => {
  it('maps a ranged task to a task kind bar', () => {
    const row = mapTaskCardToGanttWorkItem(
      {
        id: 't1',
        title: 'Pour',
        startDate: '2026-10-01',
        dueDate: '2026-10-05',
        projectId: 'p1',
      },
      0,
    );
    expect(row?.kind).toBe('task');
    expect(row?.startDate).toBe('2026-10-01');
    expect(row?.targetEndDate).toBe('2026-10-05');
  });

  it('maps missing start date to a milestone point on due date', () => {
    const row = mapTaskCardToGanttWorkItem(
      {
        id: 't2',
        title: 'Due only',
        startDate: null,
        dueDate: '2026-10-08',
        projectId: null,
      },
      1,
    );
    expect(row?.kind).toBe('milestone');
    expect(row?.startDate).toBe('2026-10-08');
    expect(row?.targetEndDate).toBe('2026-10-08');
  });
});
