/**
 * O-03b — employee retro → pending → client_coordinator approve (no salary/EMC).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { organizationMemberships } from '@drizzle/schema';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { addProjectMember, PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import {
  approveTimeEntry,
  createEmployee,
  createTimeEntry,
  getEmployee,
  submitTimeEntries,
} from '@/modules/workforce';
import {
  reviewAttendanceCorrectionRequest,
  submitAttendanceCorrectionRequest,
} from '@/modules/workforce/application/attendance-correction-requests';
import { getEmployerCostOverview } from '@/modules/workforce/application/get-employer-cost-overview';
import { addProjectTeamMember } from '@/modules/workforce/application/project-team';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { findTimeEntryById } from '@/modules/workforce/data/time-entries.repository';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, type TestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';

describe('O-03b: client_coordinator scoped operational approval', () => {
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

  async function addMember(orgId: string, roleKey: string): Promise<TestUser> {
    const user = await createTestUser(database, `${roleKey}-${randomUUID().slice(0, 8)}@example.test`);
    await database.asService(async (db) => {
      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId: user.id,
        status: 'active',
      });
      const role = await findRoleByKey(db, orgId, roleKey);
      if (!role) throw new Error(`Role ${roleKey} missing`);
      await assignRole(db, { organizationId: orgId, membershipId, userId: user.id, roleId: role.id });
    });
    return user;
  }

  it('approves pending attendance and project time for the assigned project only; denies payroll reads', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const workDate = businessDate('2026-05-12');

    const employeeUser = await addMember(orgId, 'employee');
    const coordinator = await addMember(orgId, 'worker');

    let projectAId = '';
    let projectBId = '';
    let employeeId = '';

    await database.asUser(userA.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: userA.id, organizationId: orgId, locale: 'en' });
      projectAId = (await createProject(ownerCtx, { name: 'Client Tower A' })).projectId;
      projectBId = (await createProject(ownerCtx, { name: 'Other Tower B' })).projectId;

      await addProjectMember(ownerCtx, {
        projectId: projectAId,
        userId: coordinator.id,
        templateKey: 'client_coordinator',
      });

      const employee = await createEmployee(ownerCtx, {
        name: 'Field Worker',
        userId: employeeUser.id,
        rateUnit: 'hourly',
        baseRate: '180',
        currency: 'ILS',
        hireDate: businessDate('2026-01-01'),
      });
      employeeId = employee.id;

      await addProjectTeamMember(ownerCtx, {
        projectId: projectAId,
        employeeId,
        startDate: workDate,
      });
    });

    const clockIn = new Date(`${workDate}T06:00:00.000Z`);
    const clockOut = new Date(`${workDate}T14:00:00.000Z`);

    let correctionId = '';
    await database.asUser(employeeUser.id, async (tx) => {
      const employeeCtx = await resolveOrgContext(tx, {
        userId: employeeUser.id,
        organizationId: orgId,
        locale: 'en',
      });
      const request = await submitAttendanceCorrectionRequest(employeeCtx, {
        workDate,
        requestedClockIn: clockIn.toISOString(),
        requestedClockOut: clockOut.toISOString(),
        reason: 'Forgot to clock out',
      });
      correctionId = request.id;
      expect(request.status).toBe('pending');
    });

    await database.asUser(coordinator.id, async (tx) => {
      const coordinatorCtx = await resolveOrgContext(tx, {
        userId: coordinator.id,
        organizationId: orgId,
        locale: 'en',
      });

      await expect(getEmployee(coordinatorCtx, employeeId)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getEmployerCostOverview(coordinatorCtx)).rejects.toBeInstanceOf(AuthorizationError);

      const approved = await reviewAttendanceCorrectionRequest(coordinatorCtx, {
        requestId: correctionId,
        decision: 'approved',
      });
      expect(approved.status).toBe('approved');
    });

    let entryAId = '';
    let entryBId = '';
    await database.asUser(userA.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: userA.id, organizationId: orgId, locale: 'en' });
      const entryA = await createTimeEntry(ownerCtx, {
        employeeId,
        workDate: businessDate('2026-05-13'),
        hours: '3',
        kind: 'project',
        projectId: projectAId,
      });
      entryAId = entryA.id;
      await submitTimeEntries(ownerCtx, { entryIds: [entryAId] });

      const entryB = await createTimeEntry(ownerCtx, {
        employeeId,
        workDate: businessDate('2026-05-14'),
        hours: '2',
        kind: 'project',
        projectId: projectBId,
      });
      entryBId = entryB.id;
      await submitTimeEntries(ownerCtx, { entryIds: [entryBId] });
    });

    await database.asUser(coordinator.id, async (tx) => {
      const coordinatorCtx = await resolveOrgContext(tx, {
        userId: coordinator.id,
        organizationId: orgId,
        locale: 'en',
      });

      const approvedA = await approveTimeEntry(coordinatorCtx, { timeEntryId: entryAId });
      expect(approvedA.approvalStatus).toBe('approved');
      expect(approvedA.projectId).toBe(projectAId);

      try {
        await approveTimeEntry(coordinatorCtx, { timeEntryId: entryBId });
        expect.fail('cross-project approve must be denied');
      } catch (error) {
        expect(
          error instanceof AuthorizationError || error instanceof NotFoundError,
        ).toBe(true);
      }
    });

    await database.asUser(userA.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: userA.id, organizationId: orgId, locale: 'en' });
      const stillPending = await findTimeEntryById(ownerCtx.db, orgId, entryBId);
      expect(stillPending?.approvalStatus).toBe('submitted');
    });

    await database.asUser(coordinator.id, async (tx) => {
      const coordinatorCtx = await resolveOrgContext(tx, {
        userId: coordinator.id,
        organizationId: orgId,
        locale: 'en',
      });
      const { hasProjectCapability } = await import('@/modules/project-team');
      expect(await hasProjectCapability(coordinatorCtx, projectAId, C.OPERATIONAL_APPROVE)).toBe(true);
      expect(await hasProjectCapability(coordinatorCtx, projectBId, C.OPERATIONAL_APPROVE)).toBe(false);
    });
  });
});
