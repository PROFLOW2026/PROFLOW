import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { loadProjectLaborByEmployee } from '@/modules/workforce';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';

/**
 * Owner gate: breakdown loaders stay O(1) query groups as employee count grows.
 */
describe('OWNER GATE — project actual breakdown query scale', () => {
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

  async function seedEmployees(count: number) {
    await database.reset();
    orgId = randomUUID();
    userId = randomUUID();
    projectId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: `labor-scale-${count}@example.test`,
        displayName: 'Owner',
      });
      await db.insert(organizations).values({
        id: orgId,
        name: `Labor Scale ${count}`,
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
        name: 'Scale Project',
        status: 'active',
        currency: 'ILS',
      });

      for (let i = 0; i < count; i += 1) {
        const employeeId = randomUUID();
        await db.insert(employees).values({
          id: employeeId,
          organizationId: orgId,
          name: `Employee ${i}`,
          status: 'active',
        });
        await db.insert(timeEntries).values({
          id: randomUUID(),
          organizationId: orgId,
          employeeId,
          projectId,
          workDate: '2026-01-15',
          hours: '8.000000',
          kind: 'project',
          status: 'recorded',
          approvalStatus: 'approved',
          costAmount: '100.000000',
          costCurrency: 'ILS',
        });
      }
    });
  }

  it('labor-by-employee query groups stay bounded from N=5 to N=100', async () => {
    await seedEmployees(5);
    await database.asUser(userId, async (tx) => {
      await loadProjectLaborByEmployee(tx, orgId, projectId, 'ILS');
    });

    const small = await database.asUserCountingQueries(userId, async (tx) => {
      await loadProjectLaborByEmployee(tx, orgId, projectId, 'ILS');
      return true;
    });

    await seedEmployees(100);
    await database.asUser(userId, async (tx) => {
      await loadProjectLaborByEmployee(tx, orgId, projectId, 'ILS');
    });

    const large = await database.asUserCountingQueries(userId, async (tx) => {
      const aggregate = await loadProjectLaborByEmployee(tx, orgId, projectId, 'ILS');
      expect(aggregate.employees.length).toBe(100);
      return true;
    });

    // Same set-based query groups (residual time + optional monthly). Must not scale with N.
    expect(large.queryCount).toBe(small.queryCount);
    expect(large.queryCount).toBeLessThan(20);
    // Owner gate report fields
    console.log(
      `OWNER_GATE_QUERY_COUNTS small=${small.queryCount} large=${large.queryCount}`,
    );
  }, 180_000);
});
