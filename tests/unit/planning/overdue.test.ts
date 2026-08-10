import { describe, expect, it } from 'vitest';
import {
  countOverdueWorkItems,
  detectWorkItemOverdue,
  isWorkItemOverdue,
  listOverdueWorkItems,
} from '@/modules/planning/domain/overdue';
import { assertPlanningEligible, isPlanningEligibleWorkKind } from '@/modules/planning/domain/eligibility';
import { buildCriticalPathFoundation } from '@/modules/planning/domain/critical-path-foundation';
import { buildGanttModel } from '@/modules/planning/domain/gantt-layout';
import type { PlanningDependency, PlanningWorkItem } from '@/modules/planning/domain/types';

const ORG = '018f1234-5678-7abc-8def-0123456789aa';
const PROJECT = '018f1234-5678-7abc-8def-0123456789ab';
const TODAY = '2026-08-10';

function workItem(
  overrides: Partial<PlanningWorkItem> & Pick<PlanningWorkItem, 'id' | 'name'>,
): PlanningWorkItem {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    organizationId: ORG,
    projectId: PROJECT,
    kind: 'task',
    startDate: '2026-08-01',
    targetEndDate: '2026-08-05',
    actualEndDate: null,
    progressPercent: 0,
    phaseId: null,
    workPackageId: null,
    sortOrder: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('planning overdue detection', () => {
  it('marks incomplete tasks past target as overdue', () => {
    const item = workItem({ id: '1', name: 'Late', targetEndDate: '2026-08-01', progressPercent: 40 });
    expect(isWorkItemOverdue(item, TODAY)).toBe(true);
    expect(detectWorkItemOverdue(item, TODAY).reason).toBe('past_target_incomplete');
  });

  it('does not mark 100% progress past target as overdue', () => {
    const item = workItem({
      id: '1',
      name: 'Done',
      targetEndDate: '2026-08-01',
      progressPercent: 100,
    });
    expect(isWorkItemOverdue(item, TODAY)).toBe(false);
  });

  it('marks milestones past target without actual end as overdue', () => {
    const item = workItem({
      id: 'm1',
      name: 'Gate',
      kind: 'milestone',
      startDate: null,
      targetEndDate: '2026-08-01',
      progressPercent: 0,
    });
    expect(detectWorkItemOverdue(item, TODAY).reason).toBe('milestone_missed');
  });

  it('clears overdue when actualEndDate is set', () => {
    const item = workItem({
      id: '1',
      name: 'Finished late',
      targetEndDate: '2026-08-01',
      actualEndDate: '2026-08-09',
      progressPercent: 100,
    });
    expect(isWorkItemOverdue(item, TODAY)).toBe(false);
  });

  it('lists and counts overdue items', () => {
    const items = [
      workItem({ id: '1', name: 'A', targetEndDate: '2026-08-01', progressPercent: 10 }),
      workItem({ id: '2', name: 'B', targetEndDate: '2026-08-20', progressPercent: 10 }),
      workItem({ id: '3', name: 'C', targetEndDate: '2026-08-02', progressPercent: 100 }),
    ];
    expect(countOverdueWorkItems(items, TODAY)).toBe(1);
    expect(listOverdueWorkItems(items, TODAY).map((o) => o.workItemId)).toEqual(['1']);
  });
});

describe('planning eligibility + gantt + critical path foundation', () => {
  it('allows projects and opts out jobs', () => {
    expect(isPlanningEligibleWorkKind('project')).toBe(true);
    expect(isPlanningEligibleWorkKind('job')).toBe(false);
    expect(() => assertPlanningEligible('job')).toThrow();
  });

  it('builds a gantt with overdue flags and dependency edges', () => {
    const items = [
      workItem({
        id: 'a',
        name: 'Foundation',
        startDate: '2026-08-01',
        targetEndDate: '2026-08-05',
        progressPercent: 50,
        sortOrder: 0,
      }),
      workItem({
        id: 'b',
        name: 'Frame',
        startDate: '2026-08-06',
        targetEndDate: '2026-08-12',
        progressPercent: 0,
        sortOrder: 1,
      }),
      workItem({
        id: 'm',
        name: 'Handover',
        kind: 'milestone',
        startDate: null,
        targetEndDate: '2026-08-15',
        progressPercent: 0,
        sortOrder: 2,
      }),
    ];
    const dependencies: PlanningDependency[] = [
      {
        id: 'd1',
        organizationId: ORG,
        projectId: PROJECT,
        predecessorId: 'a',
        successorId: 'b',
        type: 'finish_to_start',
        createdAt: new Date(),
      },
    ];

    const model = buildGanttModel({ workItems: items, dependencies, today: TODAY });
    expect(model).not.toBeNull();
    expect(model!.bars).toHaveLength(3);
    expect(model!.bars.find((b) => b.workItemId === 'a')?.overdue).toBe(true);
    expect(model!.bars.find((b) => b.workItemId === 'm')?.isMilestone).toBe(true);
    expect(model!.dependencyEdges).toEqual([{ predecessorId: 'a', successorId: 'b' }]);
  });

  it('never claims critical path support', () => {
    const items = [
      workItem({
        id: 'a',
        name: 'A',
        startDate: '2026-08-01',
        targetEndDate: '2026-08-03',
      }),
      workItem({
        id: 'b',
        name: 'B',
        startDate: '2026-08-04',
        targetEndDate: '2026-08-10',
      }),
    ];
    const foundation = buildCriticalPathFoundation({
      projectId: PROJECT,
      workItems: items,
      dependencies: [
        {
          id: 'd1',
          organizationId: ORG,
          projectId: PROJECT,
          predecessorId: 'a',
          successorId: 'b',
          type: 'finish_to_start',
          createdAt: new Date(),
        },
      ],
    });
    expect(foundation.supported).toBe(false);
    expect(foundation.limitationKey).toBe('planning.criticalPath.unsafe');
    expect(foundation.topologicalOrder).toEqual(['a', 'b']);
    expect(foundation.heuristicLongestPathIds).toEqual(['a', 'b']);
  });
});
