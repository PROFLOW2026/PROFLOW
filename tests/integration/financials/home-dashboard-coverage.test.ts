import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  contracts,
  contractValueEvents,
  employees,
  expenses,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  timeEntries,
  workPackages,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { getHomeDashboard } from '@/modules/financials/application/get-home-dashboard';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('home dashboard cost coverage', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;

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
        name: 'Coverage Scan Co',
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
    });
  });

  async function seedActiveProject(name: string, updatedAt: string): Promise<string> {
    return database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);

      const projectId = randomUUID();
      await db.insert(projects).values({
        id: projectId,
        organizationId: orgId,
        name,
        status: 'active',
        currency: 'ILS',
        updatedAt: new Date(updatedAt),
      });

      await db.insert(workPackages).values({
        organizationId: orgId,
        projectId,
        name: 'General',
        isDefault: true,
        sortOrder: 0,
      });

      const contractId = randomUUID();
      await db.insert(contracts).values({
        id: contractId,
        organizationId: orgId,
        projectId,
        isPrimary: true,
        originalValueAmount: '50000.000000',
        currency: 'ILS',
      });

      await db.insert(contractValueEvents).values({
        organizationId: orgId,
        contractId,
        projectId,
        kind: 'original',
        amount: '50000.000000',
        currency: 'ILS',
        effectiveDate: '2026-01-01',
      });

      await db.insert(expenses).values({
        organizationId: orgId,
        projectId,
        expenseDate: '2026-02-01',
        netAmount: '1000.000000',
        grossAmount: '1000.000000',
        currency: 'ILS',
        status: 'finalized',
        costFamily: 'direct_project',
      });

      return projectId;
    });
  }

  it('derives workforce coverage from all active projects, not only recent ones (H14)', async () => {
    for (let index = 0; index < 11; index += 1) {
      await seedActiveProject(`Recent ${index}`, `2026-06-${String(index + 1).padStart(2, '0')}T12:00:00Z`);
    }

    const olderProjectId = await seedActiveProject('Older labor project', '2026-01-01T12:00:00Z');
    const employeeId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Worker',
        status: 'active',
      });
      await db.insert(timeEntries).values({
        organizationId: orgId,
        employeeId,
        workDate: '2026-03-01',
        hours: '8',
        kind: 'project',
        projectId: olderProjectId,
        costAmount: '800.000000',
        costCurrency: 'ILS',
        approvalStatus: 'approved',
      });
    });

    const dashboard = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getHomeDashboard(context);
    });

    expect(dashboard.costCoverage).not.toBeNull();
    expect(
      dashboard.costCoverage?.entries.some(
        (entry) => entry.source === 'workforce' && entry.included,
      ),
    ).toBe(true);
  });
});
