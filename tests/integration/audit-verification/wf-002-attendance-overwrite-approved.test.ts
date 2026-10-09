/**
 * EXEC proof for WF-002 — retro attendance overwrite after manager-approved time.
 * AUDIT ONLY — documents runtime behavior (void approved rows).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/modules/projects';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import {
  applyManualAttendanceWorkdayRange,
  createEmployee,
} from '@/modules/workforce';
import { listTimeEntries } from '@/modules/workforce/data/time-entries.repository';
import {
  bulkApproveTimeEntries,
  submitTimesheet,
} from '@/modules/workforce/application/timesheets';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';
import { businessDate } from '@/shared/dates';

describe('audit WF-002: attendance overwrite vs approved time (EXEC)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let projectAId: string;
  let projectBId: string;
  let employeeId: string;
  const workDate = businessDate('2029-06-05');

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    owner = await createTestUser(database, `wf-002-owner-${Date.now()}@example.test`);
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'WF-002 Proof Org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const projectA = await createProject(context, { name: 'Project A' });
      const projectB = await createProject(context, { name: 'Project B' });
      projectAId = projectA.projectId;
      projectBId = projectB.projectId;
      const employee = await createEmployee(context, {
        name: 'Worker WF-002',
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
        hireDate: businessDate('2026-01-01'),
      });
      employeeId = employee.id;
    });
  });

  it('overwrite after explicit bulk-approve corrects approved entry in place (no void)', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'project',
        projectId: projectAId,
      });

      const afterFirst = await listTimeEntries(context.db, context.organizationId, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        status: 'recorded',
        approvalStatus: 'all',
        limit: 20,
      });
      const activeFirst = afterFirst.filter((r) => !r.voidedAt && !r.archivedAt);
      expect(activeFirst.length).toBeGreaterThanOrEqual(1);
      const entryId = activeFirst[0]!.id;

      await submitTimesheet(context, { employeeId, entryIds: [entryId] });
      await bulkApproveTimeEntries(context, { timeEntryIds: [entryId] });

      const approvedRow = (
        await listTimeEntries(context.db, context.organizationId, {
          employeeId,
          fromDate: workDate,
          toDate: workDate,
          status: 'recorded',
          approvalStatus: 'all',
          limit: 20,
        })
      ).find((r) => r.id === entryId);
      expect(approvedRow?.approvalStatus).toBe('approved');

      await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [2],
        clockInTime: '10:00',
        clockOutTime: '18:00',
        workScope: 'project',
        projectId: projectBId,
        overwriteConfirmed: true,
      });

      const afterOverwrite = await listTimeEntries(context.db, context.organizationId, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        status: 'recorded',
        approvalStatus: 'all',
        limit: 20,
      });

      const voidedOriginal = afterOverwrite.find((r) => r.id === entryId);
      expect(voidedOriginal?.voidedAt).not.toBeNull();

      const replacement = afterOverwrite.find(
        (r) =>
          !r.voidedAt &&
          !r.archivedAt &&
          r.projectId === projectBId &&
          r.approvalStatus === 'approved' &&
          r.correctsEntryId === entryId,
      );
      expect(replacement).toBeTruthy();
    });
  });
});
