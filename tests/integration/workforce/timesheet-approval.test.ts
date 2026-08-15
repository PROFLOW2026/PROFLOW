import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  timeEntries,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, findRoleByKey, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { createEmployee } from '@/modules/workforce/application/employees';
import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import { createTimeEntry, updateTimeEntry } from '@/modules/workforce/application/time-entries';
import {
  approveTimesheet,
  bulkApproveTimeEntries,
  returnTimesheet,
  submitTimeEntries,
  submitTimesheet,
} from '@/modules/workforce/application/timesheets';
import { businessDate } from '@/shared/dates';
import { AuthorizationError, NotFoundError, type DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('timesheet approval lifecycle', () => {
  let database: TestDatabase;
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let projectAId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgAId = randomUUID();
    orgBId = randomUUID();
    userAId = randomUUID();
    userBId = randomUUID();
    projectAId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values([
        { id: userAId, email: 'owner-a@example.test', displayName: 'Owner A' },
        { id: userBId, email: 'owner-b@example.test', displayName: 'Owner B' },
      ]);

      await db.insert(organizations).values([
        {
          id: orgAId,
          name: 'Alpha Electrical',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
        {
          id: orgBId,
          name: 'Beta Construction',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
      ]);

      const membershipAId = randomUUID();
      const membershipBId = randomUUID();
      await db.insert(organizationMemberships).values([
        { id: membershipAId, organizationId: orgAId, userId: userAId, status: 'active' },
        { id: membershipBId, organizationId: orgBId, userId: userBId, status: 'active' },
      ]);

      const rolesA = await provisionOrganizationRoles(db, orgAId);
      const rolesB = await provisionOrganizationRoles(db, orgBId);
      await assignRole(db, {
        organizationId: orgAId,
        membershipId: membershipAId,
        userId: userAId,
        roleId: rolesA.owner,
      });
      await assignRole(db, {
        organizationId: orgBId,
        membershipId: membershipBId,
        userId: userBId,
        roleId: rolesB.owner,
      });

      await db.insert(projects).values({
        id: projectAId,
        organizationId: orgAId,
        name: 'Site Alpha',
        status: 'active',
        currency: 'ILS',
      });
    });
  });

  it('submit → return → resubmit → approve, and draft does not create Actual', async () => {
    const result = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'he-IL',
      });

      const employee = await createEmployee(context, {
        name: 'Worker',
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
        validFrom: businessDate('2026-01-01'),
      });

      const entry = await createTimeEntry(context, {
        employeeId: employee.id,
        workDate: businessDate('2026-08-10'),
        hours: '8',
        kind: 'project',
        projectId: projectAId,
      });
      expect(entry.approvalStatus).toBe('draft');
      expect(entry.status).toBe('recorded');

      const beforeSubmit = await getProjectLaborCost(context, projectAId);
      expect(beforeSubmit.entryCount).toBe(0);
      expect(beforeSubmit.laborCost.amount).toBe('0.000000');

      const submitted = await submitTimesheet(context, {
        employeeId: employee.id,
        entryIds: [entry.id],
      });
      expect(submitted.timesheet.status).toBe('submitted');
      expect(submitted.entries[0]?.approvalStatus).toBe('submitted');

      const whileSubmitted = await getProjectLaborCost(context, projectAId);
      expect(whileSubmitted.entryCount).toBe(0);

      const returned = await returnTimesheet(context, {
        timesheetId: submitted.timesheet.id,
        managerNote: 'חסר פירוט פרויקט',
      });
      expect(returned.timesheet.status).toBe('returned');
      expect(returned.entries[0]?.approvalStatus).toBe('returned');
      expect(returned.entries[0]?.managerNote).toBe('חסר פירוט פרויקט');

      const edited = await updateTimeEntry(context, {
        timeEntryId: entry.id,
        hours: '6',
      });
      expect(Number(edited.hours)).toBe(6);
      expect(edited.approvalStatus).toBe('returned');

      const resubmitted = await submitTimeEntries(context, { entryIds: [entry.id] });
      expect(resubmitted.timesheet.status).toBe('submitted');
      expect(resubmitted.entries[0]?.approvalStatus).toBe('submitted');

      const approved = await approveTimesheet(context, { timesheetId: resubmitted.timesheet.id });
      expect(approved.timesheet.status).toBe('approved');
      expect(approved.entries[0]?.approvalStatus).toBe('approved');

      const afterApprove = await getProjectLaborCost(context, projectAId);
      expect(afterApprove.entryCount).toBe(1);
      expect(afterApprove.laborCost.amount).toBe('600.000000');

      await expect(updateTimeEntry(context, { timeEntryId: entry.id, hours: '4' })).rejects.toMatchObject({
        messageKey: 'workforce.errors.timeEntryApprovedLocked',
      } satisfies Partial<DomainRuleError>);

      const again = await approveTimesheet(context, { timesheetId: approved.timesheet.id });
      expect(again.timesheet.status).toBe('approved');

      return { entryId: entry.id, timesheetId: approved.timesheet.id };
    });

    await database.asUser(userBId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userBId,
        organizationId: orgBId,
        locale: 'en',
      });
      await expect(getProjectLaborCost(context, projectAId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(approveTimesheet(context, { timesheetId: result.timesheetId })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it('bulk-approves only submitted rows in the same org and is idempotent', async () => {
    await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const employee = await createEmployee(context, {
        name: 'Bulk worker',
        rateUnit: 'hourly',
        baseRate: '50',
        currency: 'ILS',
        validFrom: businessDate('2026-01-01'),
      });
      const first = await createTimeEntry(context, {
        employeeId: employee.id,
        workDate: businessDate('2026-08-11'),
        hours: '2',
        kind: 'project',
        projectId: projectAId,
      });
      const second = await createTimeEntry(context, {
        employeeId: employee.id,
        workDate: businessDate('2026-08-12'),
        hours: '3',
        kind: 'project',
        projectId: projectAId,
      });
      await submitTimeEntries(context, { entryIds: [first.id, second.id] });

      const firstPass = await bulkApproveTimeEntries(context, {
        timeEntryIds: [first.id, second.id],
      });
      expect(firstPass.approved.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
      expect(firstPass.alreadyApprovedIds).toEqual([]);

      const secondPass = await bulkApproveTimeEntries(context, {
        timeEntryIds: [first.id, second.id],
      });
      expect(secondPass.approved).toEqual([]);
      expect([...secondPass.alreadyApprovedIds].sort()).toEqual([first.id, second.id].sort());

      const cost = await getProjectLaborCost(context, projectAId);
      expect(cost.entryCount).toBe(2);
      expect(cost.laborCost.amount).toBe('250.000000');
    });
  });

  it('still costs grandfathered approved recorded entries', async () => {
    const employeeId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgAId,
        name: 'Legacy worker',
        status: 'active',
      });
      await db.insert(timeEntries).values({
        organizationId: orgAId,
        employeeId,
        workDate: businessDate('2026-05-04'),
        hours: '8',
        kind: 'project',
        projectId: projectAId,
        costAmount: '800.000000',
        costCurrency: 'ILS',
        status: 'recorded',
        approvalStatus: 'approved',
      });
    });

    await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const summary = await getProjectLaborCost(context, projectAId);
      expect(summary.entryCount).toBe(1);
      expect(summary.laborCost.amount).toBe('800.000000');
    });
  });

  it('requires time.approve to approve', async () => {
    const workerId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(profiles).values({
        id: workerId,
        email: 'worker-a@example.test',
        displayName: 'Worker',
      });
      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgAId,
        userId: workerId,
        status: 'active',
      });
      const workerRole = await findRoleByKey(db, orgAId, 'worker');
      if (!workerRole) throw new Error('expected worker role');
      await assignRole(db, {
        organizationId: orgAId,
        membershipId,
        userId: workerId,
        roleId: workerRole.id,
      });
    });

    const timesheetId = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const employee = await createEmployee(context, {
        name: 'Needs approval',
        rateUnit: 'hourly',
        baseRate: '10',
        currency: 'ILS',
        validFrom: businessDate('2026-01-01'),
      });
      const entry = await createTimeEntry(context, {
        employeeId: employee.id,
        workDate: businessDate('2026-08-13'),
        hours: '1',
        kind: 'project',
        projectId: projectAId,
      });
      const submitted = await submitTimeEntries(context, { entryIds: [entry.id] });
      return submitted.timesheet.id;
    });

    await database.asUser(workerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: workerId,
        organizationId: orgAId,
        locale: 'en',
      });
      expect(context.permissions.has(PERMISSIONS.TIME_MANAGE)).toBe(true);
      expect(context.permissions.has(PERMISSIONS.TIME_APPROVE)).toBe(false);
      await expect(approveTimesheet(context, { timesheetId })).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
