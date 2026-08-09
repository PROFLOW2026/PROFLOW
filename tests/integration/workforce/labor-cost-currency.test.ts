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
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('project labor cost currency (MEDIUM-13)', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let projectId: string;
  let employeeId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    userId = randomUUID();
    projectId = randomUUID();
    employeeId = randomUUID();

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
        name: 'Labor Co',
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
        name: 'ILS Project',
        status: 'active',
        currency: 'ILS',
      });

      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Worker',
        status: 'active',
      });

      await db.insert(timeEntries).values([
        {
          organizationId: orgId,
          employeeId,
          workDate: '2026-06-01',
          hours: '8',
          kind: 'project',
          projectId,
          costAmount: '800.000000',
          costCurrency: 'ILS',
        },
        {
          organizationId: orgId,
          employeeId,
          workDate: '2026-06-02',
          hours: '8',
          kind: 'project',
          projectId,
          costAmount: '900.000000',
          costCurrency: 'USD',
        },
      ]);
    });
  });

  it('sums only project-currency labor rows and reports excluded foreign rows', async () => {
    const summary = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getProjectLaborCost(context, projectId);
    });

    expect(summary.laborCost.amount).toBe('800.000000');
    expect(summary.laborCost.currency).toBe('ILS');
    expect(summary.excludedForeignCurrencyEntries).toBe(1);
  });
});
