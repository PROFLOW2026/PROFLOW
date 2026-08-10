import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEPENDENCY_CYCLE_MESSAGE,
  PlanningDependencyError,
  createInMemoryPlanningStore,
  resetDefaultPlanningStoreForTests,
  setPlanningDependency,
  upsertPlanningWorkItem,
  wouldCreateCycle,
} from '@/modules/planning';

const ORG = '018f0000-0000-7000-8000-0000000000aa';
const PROJECT = '018f0000-0000-7000-8000-0000000000a1';

describe('scenario J — planning dependency cycle A→B→C→A', () => {
  beforeEach(() => {
    resetDefaultPlanningStoreForTests();
  });

  it('setPlanningDependency rejects closing A→B→C→A', async () => {
    const repo = createInMemoryPlanningStore();

    const a = await upsertPlanningWorkItem(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        name: 'A',
        kind: 'task',
        startDate: '2026-08-01',
        targetEndDate: '2026-08-02',
      },
      { repo },
    );
    const b = await upsertPlanningWorkItem(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        name: 'B',
        kind: 'task',
        startDate: '2026-08-03',
        targetEndDate: '2026-08-04',
      },
      { repo },
    );
    const c = await upsertPlanningWorkItem(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        name: 'C',
        kind: 'task',
        startDate: '2026-08-05',
        targetEndDate: '2026-08-06',
      },
      { repo },
    );

    await setPlanningDependency(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        predecessorId: a.id,
        successorId: b.id,
      },
      { repo },
    );
    await setPlanningDependency(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        predecessorId: b.id,
        successorId: c.id,
      },
      { repo },
    );

    await expect(
      setPlanningDependency(
        {
          organizationId: ORG,
          projectId: PROJECT,
          workKind: 'project',
          predecessorId: c.id,
          successorId: a.id,
        },
        { repo },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(PlanningDependencyError);
      expect((error as PlanningDependencyError).message).toBe(DEPENDENCY_CYCLE_MESSAGE);
      expect([...(error as PlanningDependencyError).cycleNodeIds].sort()).toEqual(
        [a.id, b.id, c.id].sort(),
      );
      return true;
    });

    expect(
      wouldCreateCycle({
        projectId: PROJECT,
        workItems: [
          { id: a.id, projectId: PROJECT, archivedAt: null },
          { id: b.id, projectId: PROJECT, archivedAt: null },
          { id: c.id, projectId: PROJECT, archivedAt: null },
        ],
        dependencies: [
          { predecessorId: a.id, successorId: b.id, projectId: PROJECT },
          { predecessorId: b.id, successorId: c.id, projectId: PROJECT },
        ],
        edge: { predecessorId: c.id, successorId: a.id, projectId: PROJECT },
      }),
    ).toBe(true);
  });
});
