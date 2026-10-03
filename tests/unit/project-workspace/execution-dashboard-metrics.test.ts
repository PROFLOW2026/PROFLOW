import { describe, expect, it } from 'vitest';
import {
  buildExecutionDashboardMetrics,
  coordinationDashboardCounts,
  overdueContractorTaskCount,
  pendingSubmittalReviewCount,
  sumOpenDefects,
} from '@/modules/project-workspace';

describe('execution dashboard metrics (Track S)', () => {
  it('sums open defect buckets', () => {
    expect(
      sumOpenDefects({ open: 2, assigned: 1, reopened: 0, awaitingVerification: 3, closed: 5, overdue: 1 }),
    ).toBe(6);
  });

  it('counts upcoming and blocked coordination events', () => {
    const now = new Date('2030-06-01T12:00:00Z');
    const counts = coordinationDashboardCounts(
      [
        { startsAt: new Date('2030-06-02T09:00:00Z'), readiness: 'waiting' },
        { startsAt: new Date('2030-05-30T09:00:00Z'), readiness: 'blocked' },
        { startsAt: new Date('2030-06-03T09:00:00Z'), readiness: 'blocked' },
      ],
      now,
    );
    expect(counts.upcoming).toBe(2);
    expect(counts.blocked).toBe(2);
  });

  it('counts overdue contractor tasks using terminal rules', () => {
    const n = overdueContractorTaskCount(
      [
        { dueDate: '2030-01-01', status: 'in_progress' },
        { dueDate: '2030-01-01', status: 'closed' },
        { dueDate: null, status: 'in_progress' },
        { dueDate: '2030-01-01', status: 'approved' },
      ],
      '2030-06-01',
    );
    expect(n).toBe(1);
  });

  it('marks missing inputs as unavailable in the dashboard view', () => {
    const metrics = buildExecutionDashboardMetrics({
      coordination: null,
      overdueTasks: 2,
      defectCounts: null,
      overdueRfis: 0,
      pendingSubmittals: 4,
      openInspections: 1,
    });
    expect(metrics.coordinationUpcoming).toEqual({ kind: 'unavailable' });
    expect(metrics.overdueTasks).toEqual({ kind: 'count', value: 2 });
    expect(metrics.pendingSubmittals).toEqual({ kind: 'count', value: 4 });
  });

  it('aggregates pending submittal review statuses', () => {
    expect(pendingSubmittalReviewCount({ submitted: 2, under_review: 3 })).toBe(5);
  });
});
