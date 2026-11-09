import { describe, expect, it } from 'vitest';
import {
  mapPlanningDatesToTaskUpdate,
  mapTaskDatesToPlanningUpdate,
} from '@/modules/planning/domain/planning-task-date-copy';

describe('planning-task-date-copy', () => {
  it('maps planning start and target end to task start and due', () => {
    expect(
      mapPlanningDatesToTaskUpdate({
        startDate: '2026-03-01',
        targetEndDate: '2026-03-15',
      }),
    ).toEqual({
      startDate: '2026-03-01',
      dueDate: '2026-03-15',
    });
  });

  it('preserves null planning dates on task copy', () => {
    expect(
      mapPlanningDatesToTaskUpdate({
        startDate: null,
        targetEndDate: '2026-03-15',
      }),
    ).toEqual({
      startDate: null,
      dueDate: '2026-03-15',
    });
  });

  it('maps task start and due to planning start and target end', () => {
    expect(
      mapTaskDatesToPlanningUpdate({
        startDate: '2026-04-01',
        dueDate: '2026-04-20',
      }),
    ).toEqual({
      startDate: '2026-04-01',
      targetEndDate: '2026-04-20',
    });
  });

  it('preserves null task dates on planning copy', () => {
    expect(
      mapTaskDatesToPlanningUpdate({
        startDate: null,
        dueDate: null,
      }),
    ).toEqual({
      startDate: null,
      targetEndDate: null,
    });
  });
});
