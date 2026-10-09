/**
 * EXEC proof for WF-006 — attendance project sync auto-approves time when actor may approve.
 * AUDIT ONLY.
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
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';
import { businessDate } from '@/shared/dates';

describe('audit WF-006: attendance sync auto-approve (EXEC)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let projectId: string;
  let employeeId: string;
  const workDate = businessDate('2029-08-12');

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    owner = await createTestUser(database, `wf-006-owner-${Date.now()}@example.test`);
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'WF-006 Proof Org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const project = await createProject(context, { name: 'Sync Project' });
      projectId = project.projectId;
      const employee = await createEmployee(context, {
        name: 'Worker WF-006',
        rateUnit: 'hourly',
        baseRate: '120',
        currency: 'ILS',
        hireDate: businessDate('2026-01-01'),
      });
      employeeId = employee.id;
    });
  });

  it('applyManualAttendance leaves project time draft by default (org setting)', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const outcome = await applyManualAttendanceWorkdayRange(context, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        weekdays: [0],
        clockInTime: '08:00',
        clockOutTime: '16:00',
        workScope: 'project',
        projectId,
      });
      expect(outcome.status).toBe('applied');
      if (outcome.status !== 'applied') return;
      expect(outcome.result.projectTimeApprovedCount).toBe(0);

      const rows = await listTimeEntries(context.db, context.organizationId, {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        status: 'recorded',
        approvalStatus: 'all',
        projectId,
        limit: 10,
      });
      const active = rows.filter((r) => !r.voidedAt && !r.archivedAt);
      expect(active.length).toBeGreaterThanOrEqual(1);
      expect(active.every((r) => r.approvalStatus === 'draft')).toBe(true);
    });
  });
});
