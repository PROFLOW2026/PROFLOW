import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { organizationMemberships, organizations, profiles, projects } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { createEmployee } from '@/modules/workforce/application/employees';
import { createTimeEntry } from '@/modules/workforce/application/time-entries';
import { approveTimeEntry, submitTimeEntries } from '@/modules/workforce/application/timesheets';
import { sumProjectLaborCost } from '@/modules/workforce/data/time-entries.repository';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('approve time entry → sumProjectLaborCost', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    userId = randomUUID();
    projectId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: 'owner@example.test',
        displayName: 'Owner',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'Labor Org',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });

      const roles = await provisionOrganizationRoles(db, orgId);
      await assignRole(db, {
        organizationId: orgId,
        membershipId,
        userId,
        roleId: roles.owner,
      });

      await db.insert(projects).values({
        id: projectId,
        organizationId: orgId,
        name: 'Labor Project',
        status: 'active',
        currency: 'ILS',
      });
    });
  });

  it('includes approved project hours in sumProjectLaborCost', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const employee = await createEmployee(context, {
        name: 'Installer',
        rateUnit: 'hourly',
        baseRate: '150',
        currency: 'ILS',
        validFrom: businessDate('2026-03-01'),
      });

      const entry = await createTimeEntry(context, {
        employeeId: employee.id,
        workDate: businessDate('2026-03-12'),
        hours: '4',
        kind: 'project',
        projectId,
      });

      const before = await sumProjectLaborCost(tx, orgId, projectId, 'ILS');
      expect(before.entryCount).toBe(0);

      await submitTimeEntries(context, { entryIds: [entry.id] });
      const whileSubmitted = await sumProjectLaborCost(tx, orgId, projectId, 'ILS');
      expect(whileSubmitted.entryCount).toBe(0);

      await approveTimeEntry(context, { timeEntryId: entry.id });
      const after = await sumProjectLaborCost(tx, orgId, projectId, 'ILS');
      expect(after.entryCount).toBe(1);
      expect(after.totalAmount).toBe('600.000000');
    });
  });
});
