/**
 * Scoped operational approvers see project-filtered approval queue without org time.approve.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { organizationMemberships } from '@drizzle/schema';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { addProjectMember, PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import {
  createEmployee,
  createTimeEntry,
  listTimeApprovalQueue,
  submitTimeEntries,
} from '@/modules/workforce';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, type TestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';
import { addProjectTeamMember } from '@/modules/workforce/application/project-team';

describe('scoped operational time approval queue', () => {
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

  async function addWorker(orgId: string): Promise<TestUser> {
    const user = await createTestUser(database, `worker-${randomUUID().slice(0, 8)}@example.test`);
    await database.asService(async (db) => {
      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId: user.id,
        status: 'active',
      });
      const role = await findRoleByKey(db, orgId, 'worker');
      if (!role) throw new Error('worker role missing');
      await assignRole(db, { organizationId: orgId, membershipId, userId: user.id, roleId: role.id });
    });
    return user;
  }

  it('lists only scoped project rows for operational.approve; denies queue without scope', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const coordinator = await addWorker(orgId);

    let projectAId = '';
    let projectBId = '';
    let employeeId = '';

    await database.asUser(userA.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: userA.id, organizationId: orgId, locale: 'en' });
      projectAId = (await createProject(ownerCtx, { name: 'Tower A' })).projectId;
      projectBId = (await createProject(ownerCtx, { name: 'Tower B' })).projectId;
      employeeId = (
        await createEmployee(ownerCtx, {
          name: 'Field Tech',
          rateUnit: 'hourly',
          baseRate: '100',
          currency: 'ILS',
          validFrom: businessDate('2026-01-01'),
        })
      ).id;

      await addProjectTeamMember(ownerCtx, {
        projectId: projectAId,
        employeeId,
        plannedAllocationPercent: '100',
      });

      await addProjectMember(ownerCtx, {
        projectId: projectAId,
        userId: coordinator.id,
        templateKey: 'client_coordinator',
        capabilities: [C.OPERATIONAL_APPROVE],
      });

      const entryA = await createTimeEntry(ownerCtx, {
        employeeId,
        workDate: businessDate('2026-06-10'),
        hours: '2',
        kind: 'project',
        projectId: projectAId,
      });
      await submitTimeEntries(ownerCtx, { entryIds: [entryA.id] });

      const draftB = await createTimeEntry(ownerCtx, {
        employeeId,
        workDate: businessDate('2026-06-11'),
        hours: '1',
        kind: 'project',
        projectId: projectBId,
      });

      expect(draftB.approvalStatus).toBe('draft');
    });

    await database.asUser(coordinator.id, async (tx) => {
      const coordinatorCtx = await resolveOrgContext(tx, {
        userId: coordinator.id,
        organizationId: orgId,
        locale: 'en',
      });
      expect(coordinatorCtx.permissions.has(PERMISSIONS.TIME_APPROVE)).toBe(false);

      const queue = await listTimeApprovalQueue(coordinatorCtx, {});
      expect(queue.entries.some((row) => row.projectId === projectAId)).toBe(true);
      expect(queue.entries.some((row) => row.projectId === projectBId)).toBe(false);
      expect(queue.entries.some((row) => row.approvalStatus === 'submitted')).toBe(true);
    });

    const outsider = await addWorker(orgId);
    await database.asUser(outsider.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: outsider.id, organizationId: orgId, locale: 'en' });
      await expect(listTimeApprovalQueue(ctx, {})).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
