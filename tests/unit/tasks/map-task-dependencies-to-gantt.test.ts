import { describe, expect, it } from 'vitest';
import { mapTaskDependenciesToGantt } from '@/modules/tasks/domain/map-task-dependencies-to-gantt';

describe('mapTaskDependenciesToGantt', () => {
  it('maps finish_to_start edges only', () => {
    const rows = mapTaskDependenciesToGantt(
      [
        {
          id: 'd1',
          organizationId: 'org',
          sourceTaskId: 'a',
          targetTaskId: 'b',
          dependencyType: 'finish_to_start',
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'd2',
          organizationId: 'org',
          sourceTaskId: 'b',
          targetTaskId: 'c',
          dependencyType: 'blocked_by',
          createdAt: new Date('2026-01-01'),
        },
      ],
      'org',
      'p1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      predecessorId: 'a',
      successorId: 'b',
      type: 'finish_to_start',
    });
  });
});
