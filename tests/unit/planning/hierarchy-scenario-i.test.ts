import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertPhaseBelongsToProject,
  assertWorkPackageBelongsToProject,
  PHASE_CROSS_PROJECT_MESSAGE,
  WORK_PACKAGE_CROSS_PROJECT_MESSAGE,
  upsertPlanningWorkItem,
  createInMemoryPlanningStore,
  resetDefaultPlanningStoreForTests,
} from '@/modules/planning';

const ORG = '018f0000-0000-7000-8000-0000000000aa';
const PROJECT_A = '018f0000-0000-7000-8000-0000000000a1';
const PROJECT_B = '018f0000-0000-7000-8000-0000000000b1';
const PHASE_B = '018f0000-0000-7000-8000-0000000000c1';
const WP_B = '018f0000-0000-7000-8000-0000000000d1';

describe('scenario I — planning cross-project phase / work package', () => {
  it('domain rejects phase from another project', () => {
    expect(() =>
      assertPhaseBelongsToProject(
        { organizationId: ORG, projectId: PROJECT_B },
        { organizationId: ORG, projectId: PROJECT_A },
      ),
    ).toThrow(DomainRuleError);
    try {
      assertPhaseBelongsToProject(
        { organizationId: ORG, projectId: PROJECT_B },
        { organizationId: ORG, projectId: PROJECT_A },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe(PHASE_CROSS_PROJECT_MESSAGE);
    }
  });

  it('domain rejects work package from another project', () => {
    expect(() =>
      assertWorkPackageBelongsToProject(
        { organizationId: ORG, projectId: PROJECT_B },
        { organizationId: ORG, projectId: PROJECT_A },
      ),
    ).toThrow(DomainRuleError);
    try {
      assertWorkPackageBelongsToProject(
        { organizationId: ORG, projectId: PROJECT_B },
        { organizationId: ORG, projectId: PROJECT_A },
      );
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe(WORK_PACKAGE_CROSS_PROJECT_MESSAGE);
    }
  });

  it('upsert rejects phase_id that belongs to a different project', async () => {
    resetDefaultPlanningStoreForTests();
    const repo = createInMemoryPlanningStore();

    await expect(
      upsertPlanningWorkItem(
        {
          organizationId: ORG,
          projectId: PROJECT_A,
          workKind: 'project',
          name: 'Task on A',
          kind: 'task',
          startDate: '2026-08-01',
          targetEndDate: '2026-08-10',
          phaseId: PHASE_B,
        },
        {
          repo,
          lookups: {
            findPhase: async () => ({ organizationId: ORG, projectId: PROJECT_B }),
          },
        },
      ),
    ).rejects.toMatchObject({ messageKey: PHASE_CROSS_PROJECT_MESSAGE });
  });

  it('upsert rejects work_package_id that belongs to a different project', async () => {
    const repo = createInMemoryPlanningStore();

    await expect(
      upsertPlanningWorkItem(
        {
          organizationId: ORG,
          projectId: PROJECT_A,
          workKind: 'project',
          name: 'Task on A',
          kind: 'task',
          startDate: '2026-08-01',
          targetEndDate: '2026-08-10',
          workPackageId: WP_B,
        },
        {
          repo,
          lookups: {
            findWorkPackage: async () => ({ organizationId: ORG, projectId: PROJECT_B }),
          },
        },
      ),
    ).rejects.toMatchObject({ messageKey: WORK_PACKAGE_CROSS_PROJECT_MESSAGE });
  });

  it('upsert accepts phase and work package on the same project', async () => {
    const repo = createInMemoryPlanningStore();
    const item = await upsertPlanningWorkItem(
      {
        organizationId: ORG,
        projectId: PROJECT_A,
        workKind: 'project',
        name: 'Aligned task',
        kind: 'task',
        startDate: '2026-08-01',
        targetEndDate: '2026-08-10',
        phaseId: PHASE_B,
        workPackageId: WP_B,
      },
      {
        repo,
        lookups: {
          findPhase: async () => ({ organizationId: ORG, projectId: PROJECT_A }),
          findWorkPackage: async () => ({ organizationId: ORG, projectId: PROJECT_A }),
        },
      },
    );
    expect(item.phaseId).toBe(PHASE_B);
    expect(item.workPackageId).toBe(WP_B);
  });
});
