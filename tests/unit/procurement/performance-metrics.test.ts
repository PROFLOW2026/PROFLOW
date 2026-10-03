import { describe, expect, it } from 'vitest';
import { computePerformanceMetrics } from '@/modules/contractor-performance';

describe('Track Q performance metrics', () => {
  it('computes transparent rates without inventing a score', () => {
    const metrics = computePerformanceMetrics({
      tasksAssigned: 10,
      tasksCompletedOnTime: 8,
      defectsReported: 4,
      defectsReopened: 1,
      rfisAnsweredWithinSla: 3,
      rfisTotalAnswered: 4,
      inspectionsPassed: 2,
      inspectionsTotal: 2,
      complianceDocumentsApproved: 5,
      complianceDocumentsRequired: 6,
    });
    expect(metrics.formulaVersion).toBe('q-v1');
    expect(metrics.taskTimelinessRate).toBe(0.8);
    expect(metrics.defectReopenRate).toBe(0.25);
    expect(metrics.inspectionPassRate).toBe(1);
    expect(Object.keys(metrics)).not.toContain('aiScore');
  });
});
