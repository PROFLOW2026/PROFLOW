/**
 * EXEC proof for WF-007 — parallel timesheet vs entry-level approval paths.
 * AUDIT ONLY.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/modules/projects';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createEmployee, createTimeEntry } from '@/modules/workforce';
import { findTimesheetById } from '@/modules/workforce/data/timesheets.repository';
import { approveTimeEntry, submitTimesheet } from '@/modules/workforce/application/timesheets';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';
import { businessDate } from '@/shared/dates';

describe('audit WF-007: dual approval paths (EXEC)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let projectId: string;
  let employeeId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    owner = await createTestUser(database, `wf-007-owner-${Date.now()}@example.test`);
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'WF-007 Proof Org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const project = await createProject(context, { name: 'Dual Path Project' });
      projectId = project.projectId;
      const employee = await createEmployee(context, {
        name: 'Worker WF-007',
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
        hireDate: businessDate('2026-01-01'),
      });
      employeeId = employee.id;
    });
  });

  it('entry-level approveTimeEntry closes submitted timesheet when all entries approved', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const entry = await createTimeEntry(context, {
        employeeId,
        workDate: businessDate('2026-09-01'),
        hours: '4',
        kind: 'project',
        projectId,
      });

      const submitted = await submitTimesheet(context, {
        employeeId,
        entryIds: [entry.id],
      });
      expect(submitted.timesheet.status).toBe('submitted');

      const approvedEntry = await approveTimeEntry(context, { timeEntryId: entry.id });
      expect(approvedEntry.approvalStatus).toBe('approved');

      const sheet = await findTimesheetById(
        context.db,
        context.organizationId,
        submitted.timesheet.id,
      );
      expect(sheet?.status).toBe('approved');
    });
  });
});
