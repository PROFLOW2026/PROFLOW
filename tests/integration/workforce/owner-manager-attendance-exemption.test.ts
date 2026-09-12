import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  laborAllocationRuns,
  organizationMemberships,
  organizations,
  profiles,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { OPTIONAL_MODULE_KEYS, type ModuleVisibility } from '@/modules/tenancy/domain/types';
import { businessDate } from '@/shared/dates';
import { createEmployee } from '@/modules/workforce/application/employees';
import {
  getTodayAttendanceOverview,
  listEmployeesWithoutAttendanceToday,
} from '@/modules/workforce';
import { collectMissingAttendanceToday } from '@/modules/command-center/data/collect-sources';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('owner_manager attendance exemption', () => {
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
        name: 'Owner Attendance Co',
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

  it('does not flag owner_manager in missing-attendance collectors (CASE 1/5)', async () => {
    const workDate = businessDate('2026-03-02'); // Monday

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await createEmployee(context, {
        name: 'Owner Manager',
        rateUnit: 'monthly',
        baseRate: '18000',
        currency: 'ILS',
        burdenPercent: '50',
        hireDate: businessDate('2026-01-01'),
        workingDaysPerMonth: '22',
        compensationClass: 'owner_manager',
        defaultLaborAllocationIntent: 'company_only',
      });

      await createEmployee(context, {
        name: 'Regular Worker',
        rateUnit: 'hourly',
        baseRate: '120',
        hireDate: businessDate('2026-01-01'),
        compensationClass: 'standard',
      });

      const missing = await listEmployeesWithoutAttendanceToday(context, workDate);
      expect(missing.map((row) => row.employeeName)).toEqual(['Regular Worker']);

      const overview = await getTodayAttendanceOverview(context, workDate);
      expect(overview.missingCount).toBe(1);
      expect(overview.rows.find((row) => row.employeeName === 'Owner Manager')?.approvalStatus).toBe(
        'approved',
      );
      expect(
        overview.rows.find((row) => row.employeeName === 'Regular Worker')?.approvalStatus,
      ).toBe('missing');

      const modules = Object.fromEntries(
        OPTIONAL_MODULE_KEYS.map((key) => [key, true]),
      ) as ModuleVisibility;

      const alerts = await collectMissingAttendanceToday({
        context,
        modules,
        today: workDate,
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.where).toBe('Regular Worker');
      expect(alerts.some((item) => item.where === 'Owner Manager')).toBe(false);
    });
  });

  it('recognizes monthly employer cost without attendance or timesheet (CASE 2)', async () => {
    const workDate = businessDate('2026-03-02');

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const owner = await createEmployee(context, {
        name: 'Owner No Attendance',
        rateUnit: 'monthly',
        baseRate: '18000',
        currency: 'ILS',
        burdenPercent: '50',
        hireDate: businessDate('2026-01-01'),
        workingDaysPerMonth: '22',
        compensationClass: 'owner_manager',
        defaultLaborAllocationIntent: 'company_only',
      });

      const missing = await listEmployeesWithoutAttendanceToday(context, workDate);
      expect(missing.some((row) => row.employeeId === owner.id)).toBe(false);

      const monthRows = await tx
        .select({
          knownAmount: employeeMonthCosts.knownAmount,
          companyOnlyAmount: laborAllocationRuns.companyOnlyAmount,
        })
        .from(employeeMonthCosts)
        .leftJoin(
          laborAllocationRuns,
          and(
            eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        )
        .where(eq(employeeMonthCosts.employeeId, owner.id));

      expect(monthRows.length).toBeGreaterThan(0);
      for (const row of monthRows) {
        expect(Number(row.knownAmount)).toBeGreaterThan(0);
        expect(row.companyOnlyAmount).toBe(row.knownAmount);
      }
    });
  });

  it('exempts project_allocate owner_manager from attendance alerts (CASE 3)', async () => {
    const workDate = businessDate('2026-03-02');

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await createEmployee(context, {
        name: 'Owner With Project Intent',
        rateUnit: 'monthly',
        baseRate: '18000',
        currency: 'ILS',
        burdenPercent: '50',
        hireDate: businessDate('2026-01-01'),
        compensationClass: 'owner_manager',
        defaultLaborAllocationIntent: 'project_allocate',
      });

      const missing = await listEmployeesWithoutAttendanceToday(context, workDate);
      expect(missing).toHaveLength(0);
    });
  });
});
