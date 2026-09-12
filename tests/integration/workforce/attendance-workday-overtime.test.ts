import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { organizationMemberships, organizations, profiles } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { businessDate } from '@/shared/dates';
import { createEmployee } from '@/modules/workforce/application/employees';
import {
  clockAttendance,
  listAttendanceDaysForOrg,
  listEmployeesWithoutAttendanceToday,
  previewManualAttendanceWorkdayRange,
  setAttendanceDayOvertime,
} from '@/modules/workforce';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('non-standard workdays and overtime classification', () => {
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
        name: 'Workday Overtime Co',
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

  it('CASE 1/2: no missing alert on Friday; hourly employee may clock in (overtime false)', async () => {
    const friday = businessDate('2026-03-06');

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const employee = await createEmployee(context, {
        name: 'Hourly Worker',
        rateUnit: 'hourly',
        baseRate: '120',
        hireDate: businessDate('2026-01-01'),
      });

      const missing = await listEmployeesWithoutAttendanceToday(context, friday);
      expect(missing.some((row) => row.employeeId === employee.id)).toBe(false);

      await clockAttendance(context, {
        employeeId: employee.id,
        workDate: friday,
        eventType: 'clock_in',
      });

      const days = await listAttendanceDaysForOrg(context, {
        employeeId: employee.id,
        fromDate: friday,
        toDate: friday,
      });
      expect(days).toHaveLength(1);
      expect(days[0]?.isOvertime).toBe(false);
    });
  });

  it('CASE 3/4: owner marks and clears overtime on attendance day', async () => {
    const friday = businessDate('2026-03-06');

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const employee = await createEmployee(context, {
        name: 'Hourly Worker',
        rateUnit: 'hourly',
        baseRate: '120',
        hireDate: businessDate('2026-01-01'),
      });

      await clockAttendance(context, {
        employeeId: employee.id,
        workDate: friday,
        eventType: 'clock_in',
      });

      const days = await listAttendanceDaysForOrg(context, {
        employeeId: employee.id,
        fromDate: friday,
        toDate: friday,
      });
      const dayId = days[0]?.id;
      expect(dayId).toBeTruthy();

      const marked = await setAttendanceDayOvertime(context, { dayId: dayId!, isOvertime: true });
      expect(marked.isOvertime).toBe(true);

      const cleared = await setAttendanceDayOvertime(context, { dayId: dayId!, isOvertime: false });
      expect(cleared.isOvertime).toBe(false);
    });
  });

  it('CASE 7: retro preview skips Friday when weekdays are Sun–Thu', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const employee = await createEmployee(context, {
        name: 'Retro Worker',
        rateUnit: 'hourly',
        baseRate: '120',
        hireDate: businessDate('2026-01-01'),
      });

      const preview = await previewManualAttendanceWorkdayRange(context, {
        employeeId: employee.id,
        fromDate: businessDate('2026-03-01'),
        toDate: businessDate('2026-03-07'),
        weekdays: [0, 1, 2, 3, 4],
      });

      expect(preview.dates).not.toContain('2026-03-06');
      expect(preview.dates).toContain('2026-03-05');
    });
  });
});
