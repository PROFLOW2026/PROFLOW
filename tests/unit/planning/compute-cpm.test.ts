import { describe, expect, it } from 'vitest';
import { buildCriticalPathFoundation } from '@/modules/planning/domain/critical-path-foundation';
import { computeCpm } from '@/modules/planning/domain/compute-cpm';
import type { PlanningDependency, PlanningWorkItem } from '@/modules/planning/domain/types';

const ORG = '018f1234-5678-7abc-8def-0123456789aa';
const PROJECT = '018f1234-5678-7abc-8def-0123456789ab';
const NOW = new Date('2026-08-01T12:00:00.000Z');

function workItem(
  overrides: Partial<PlanningWorkItem> & Pick<PlanningWorkItem, 'id' | 'name'>,
): PlanningWorkItem {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    kind: 'task',
    startDate: '2026-08-01',
    targetEndDate: '2026-08-03',
    actualEndDate: null,
    progressPercent: 0,
    phaseId: null,
    workPackageId: null,
    taskId: null,
    sortOrder: 0,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function edge(predecessorId: string, successorId: string): PlanningDependency {
  return {
    id: `d-${predecessorId}-${successorId}`,
    organizationId: ORG,
    projectId: PROJECT,
    predecessorId,
    successorId,
    type: 'finish_to_start',
    createdAt: NOW,
  };
}

describe('computeCpm', () => {
  it('computes ES/EF/LS/LF and float on a simple FS chain', () => {
    const items = [
      workItem({ id: 'a', name: 'A', startDate: '2026-08-01', targetEndDate: '2026-08-03' }),
      workItem({ id: 'b', name: 'B', startDate: '2026-08-04', targetEndDate: '2026-08-10' }),
      workItem({ id: 'c', name: 'C', startDate: '2026-08-11', targetEndDate: '2026-08-12' }),
    ];
    const dependencies = [edge('a', 'b'), edge('b', 'c')];
    const order = ['a', 'b', 'c'];

    const result = computeCpm({ workItems: items, dependencies, topologicalOrder: order });

    expect(result.earlyStartByWorkItemId).toEqual({ a: 0, b: 3, c: 10 });
    expect(result.earlyFinishByWorkItemId).toEqual({ a: 2, b: 9, c: 11 });
    expect(result.lateStartByWorkItemId).toEqual({ a: 0, b: 3, c: 10 });
    expect(result.floatByWorkItemId).toEqual({ a: 0, b: 0, c: 0 });
    expect(result.criticalPathIds).toEqual(['a', 'b', 'c']);
    expect(result.projectEndDay).toBe(11);
  });

  it('assigns positive float on the non-driving parallel branch', () => {
    const items = [
      workItem({ id: 'a', name: 'A', startDate: '2026-08-01', targetEndDate: '2026-08-02' }),
      workItem({ id: 'b', name: 'B', startDate: '2026-08-01', targetEndDate: '2026-08-06' }),
      workItem({ id: 'c', name: 'C', startDate: '2026-08-07', targetEndDate: '2026-08-08' }),
    ];
    const dependencies = [edge('a', 'c'), edge('b', 'c')];
    const order = ['a', 'b', 'c'];

    const result = computeCpm({ workItems: items, dependencies, topologicalOrder: order });

    expect(result.floatByWorkItemId.a).toBe(4);
    expect(result.floatByWorkItemId.b).toBe(0);
    expect(result.floatByWorkItemId.c).toBe(0);
    expect(result.criticalPathIds).toContain('b');
    expect(result.criticalPathIds).toContain('c');
    expect(result.criticalPathIds).not.toContain('a');
  });
});

describe('buildCriticalPathFoundation', () => {
  it('returns supported CPM when all active items are dated and graph is acyclic', () => {
    const foundation = buildCriticalPathFoundation({
      projectId: PROJECT,
      workItems: [
        workItem({ id: 'a', name: 'A', startDate: '2026-08-01', targetEndDate: '2026-08-03' }),
        workItem({ id: 'b', name: 'B', startDate: '2026-08-04', targetEndDate: '2026-08-10' }),
      ],
      dependencies: [edge('a', 'b')],
    });

    expect(foundation.supported).toBe(true);
    if (!foundation.supported) return;
    expect(foundation.criticalPathIds).toEqual(['a', 'b']);
    expect(foundation.floatByWorkItemId).toEqual({ a: 0, b: 0 });
  });

  it('returns unsupported when the graph has a cycle', () => {
    const foundation = buildCriticalPathFoundation({
      projectId: PROJECT,
      workItems: [
        workItem({ id: 'a', name: 'A' }),
        workItem({ id: 'b', name: 'B' }),
      ],
      dependencies: [edge('a', 'b'), edge('b', 'a')],
    });

    expect(foundation.supported).toBe(false);
    if (foundation.supported) return;
    expect(foundation.limitationKey).toBe('planning.criticalPath.unsafe');
    expect(foundation.topologicalOrder).toEqual([]);
  });

  it('returns missingDates when an active task has no start date', () => {
    const foundation = buildCriticalPathFoundation({
      projectId: PROJECT,
      workItems: [
        workItem({ id: 'a', name: 'A', startDate: null, targetEndDate: '2026-08-10' }),
        workItem({ id: 'b', name: 'B' }),
      ],
      dependencies: [edge('a', 'b')],
    });

    expect(foundation.supported).toBe(false);
    if (foundation.supported) return;
    expect(foundation.limitationKey).toBe('planning.criticalPath.missingDates');
  });
});
