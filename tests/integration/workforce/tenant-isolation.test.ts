import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  rateVersions,
  timeEntries,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { getEmployee, listEmployeesForOrg } from '@/modules/workforce/application/employees';
import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import { resolveOrgContext } from '@/modules/tenancy';
import { NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

/**
 * PGlite does not always honour `SET LOCAL ROLE authenticated` for org
 * founding, so this suite arranges tenants with service_role and asserts
 * isolation through the real application layer as each user.
 */
describe('workforce tenant isolation', () => {
  let database: TestDatabase;
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let projectAId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

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

  it('prevents organization B from reading organization A employees', async () => {
    const employeeId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgAId,
        name: 'Worker A',
        status: 'active',
      });
    });

    await database.asUser(userBId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userBId,
        organizationId: orgBId,
        locale: 'en',
      });

      const list = await listEmployeesForOrg(context);
      expect(list.some((row) => row.id === employeeId)).toBe(false);
      await expect(getEmployee(context, employeeId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('prevents organization B from attributing labor cost to organization A project', async () => {
    const employeeId = randomUUID();
    const rateVersionId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgAId,
        name: 'Worker A',
        status: 'active',
      });
      await db.insert(rateVersions).values({
        id: rateVersionId,
        organizationId: orgAId,
        employeeId,
        validFrom: '2026-01-01',
        baseRate: '100',
        rateUnit: 'hourly',
        currency: 'ILS',
      });
      await db.insert(timeEntries).values({
        organizationId: orgAId,
        employeeId,
        workDate: '2026-06-10',
        hours: '8',
        kind: 'project',
        projectId: projectAId,
        rateVersionId,
        costAmount: '800',
        costCurrency: 'ILS',
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

    await database.asUser(userBId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userBId,
        organizationId: orgBId,
        locale: 'en',
      });

      await expect(getProjectLaborCost(context, projectAId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
