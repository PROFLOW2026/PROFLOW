import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { organizationMemberships, organizations, profiles } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { and, eq } from 'drizzle-orm';
import { employeeMonthCosts, laborAllocationRuns } from '@drizzle/schema';
import { createEmployee, getEmployee } from '@/modules/workforce/application/employees';
import { resolveOrgContext } from '@/modules/tenancy';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('owner / manager employee create (0084)', () => {
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
        name: 'Owner Manager Co',
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

  it('creates monthly owner_manager with company_only intent and rate', async () => {
    const employeeId = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const created = await createEmployee(context, {
        name: 'Owner Manager Test',
        rateUnit: 'monthly',
        baseRate: '48000',
        currency: 'ILS',
        burdenPercent: '25',
        hireDate: businessDate('2026-01-01'),
        workingDaysPerMonth: '22',
        compensationClass: 'owner_manager',
        defaultLaborAllocationIntent: 'company_only',
      });
      expect(created.compensationClass).toBe('owner_manager');
      expect(created.defaultLaborAllocationIntent).toBe('company_only');
      expect(created.rateVersions).toHaveLength(1);
      return created.id;
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const loaded = await getEmployee(context, employeeId);
      expect(loaded.compensationClass).toBe('owner_manager');
      expect(loaded.defaultLaborAllocationIntent).toBe('company_only');

      const currentYearMonth = todayInTimeZone('Asia/Jerusalem').slice(0, 7);
      const monthRows = await tx
        .select({
          yearMonth: employeeMonthCosts.yearMonth,
          knownAmount: employeeMonthCosts.knownAmount,
          companyOnlyAmount: laborAllocationRuns.companyOnlyAmount,
          allocatedAmount: laborAllocationRuns.allocatedAmount,
          unallocatedAmount: laborAllocationRuns.unallocatedAmount,
        })
        .from(employeeMonthCosts)
        .leftJoin(
          laborAllocationRuns,
          and(
            eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        )
        .where(eq(employeeMonthCosts.employeeId, employeeId))
        .orderBy(employeeMonthCosts.yearMonth);

      expect(monthRows.length).toBeGreaterThan(0);
      expect(monthRows.some((row) => row.yearMonth === currentYearMonth)).toBe(true);
      for (const row of monthRows) {
        expect(Number(row.knownAmount)).toBeGreaterThan(0);
        expect(row.companyOnlyAmount).toBe(row.knownAmount);
        expect(row.allocatedAmount).toBe('0.000000');
        expect(row.unallocatedAmount).toBe('0.000000');
      }
    });
  });

  it('creates monthly owner_manager with project_allocate intent', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const created = await createEmployee(context, {
        name: 'Owner With Projects',
        rateUnit: 'monthly',
        baseRate: '52000',
        hireDate: businessDate('2026-01-01'),
        compensationClass: 'owner_manager',
        defaultLaborAllocationIntent: 'project_allocate',
      });
      expect(created.defaultLaborAllocationIntent).toBe('project_allocate');
    });
  });

  it('creates standard employee unchanged', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const created = await createEmployee(context, {
        name: 'Regular Worker',
        rateUnit: 'hourly',
        baseRate: '120',
        hireDate: businessDate('2026-01-01'),
      });
      expect(created.compensationClass).toBe('standard');
      expect(created.defaultLaborAllocationIntent).toBe('auto_pool');
    });
  });
});
