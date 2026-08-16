import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/modules/projects';
import {
  createDrizzlePlanningRepository,
  listPlanningPlan,
  setPlanningDependency,
  upsertPlanningWorkItem,
} from '@/modules/planning';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

/**
 * Scenario L - planning metadata survives a new repository instance (restart double).
 * Uses disposable PGlite; does not flip production PLANNING_PERSISTENCE_READY.
 */
describe('scenario L - planning persistence restart', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('work items and dependencies remain after recreating the Drizzle repository', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { organizationId, projectId, workItemIds } = await database.asUser(
      userA.id,
      async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const { projectId: pid } = await createProject(context, {
          name: 'Plan Restart Project',
        });

        const repo1 = createDrizzlePlanningRepository(tx);
        const a = await upsertPlanningWorkItem(
          {
            organizationId: context.organizationId,
            projectId: pid,
            workKind: 'project',
            name: 'Foundation',
            kind: 'task',
            startDate: '2026-08-01',
            targetEndDate: '2026-08-10',
          },
          { repo: repo1 },
        );
        const b = await upsertPlanningWorkItem(
          {
            organizationId: context.organizationId,
            projectId: pid,
            workKind: 'project',
            name: 'Framing',
            kind: 'task',
            startDate: '2026-08-11',
            targetEndDate: '2026-08-20',
          },
          { repo: repo1 },
        );
        await setPlanningDependency(
          {
            organizationId: context.organizationId,
            projectId: pid,
            workKind: 'project',
            predecessorId: a.id,
            successorId: b.id,
          },
          { repo: repo1 },
        );

        return {
          organizationId: context.organizationId,
          projectId: pid,
          workItemIds: [a.id, b.id] as const,
        };
      },
    );

    // New repository handle = process restart against durable storage.
    await database.asService(async (db) => {
      const repo2 = createDrizzlePlanningRepository(db);
      const view = await listPlanningPlan(
        {
          organizationId,
          projectId,
          workKind: 'project',
          today: '2026-08-15',
        },
        { repo: repo2 },
      );

      expect(view.snapshot.workItems.map((i) => i.id).sort()).toEqual(
        [...workItemIds].sort(),
      );
      expect(view.snapshot.dependencies).toHaveLength(1);
      expect(view.snapshot.dependencies[0]?.predecessorId).toBe(workItemIds[0]);
      expect(view.snapshot.dependencies[0]?.successorId).toBe(workItemIds[1]);
      expect(view.criticalPathFoundation.supported).toBe(false);
    });
  });
});
