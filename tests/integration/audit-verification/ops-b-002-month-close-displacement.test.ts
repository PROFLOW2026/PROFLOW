/**
 * EXEC verification for OPS-B-002 — month close + draft actual EMC without unsafe recognition flip.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { employeeMonthCosts } from '@drizzle/schema';
import {
  closeMonthClosePeriod,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import { createProject } from '@/modules/projects';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createEmployee } from '@/modules/workforce';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

describe('audit OPS-B-002: month-close displacement coupling (EXEC)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    owner = await createTestUser(database, 'ops-b-002-owner@example.test');
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'OPS-B-002 Org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      await createProject(context, { name: 'Close probe site' });
      await createEmployee(context, {
        name: 'Month close worker',
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
        hireDate: businessDate('2026-01-01'),
      });
    });
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('closeMonthClosePeriod locks draft actual EMC while keeping time_snapshot recognition', async () => {
    const yearMonth = '2026-11';
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const employee = await createEmployee(context, {
        name: 'EMC snapshot worker',
        rateUnit: 'hourly',
        baseRate: '80',
        currency: 'ILS',
        hireDate: businessDate('2026-01-01'),
      });

      await tx.insert(employeeMonthCosts).values({
        organizationId: orgId,
        employeeId: employee.id,
        yearMonth,
        currency: 'ILS',
        knownAmount: '6400',
        actualAmount: '6400',
        knownQuality: 'actual',
        status: 'draft',
        recognitionSource: 'time_snapshot',
      });

      const period = await ensureMonthClosePeriod(context, { yearMonth });
      await markMonthCloseReady(context, { periodId: period.id });

      const closed = await closeMonthClosePeriod(context, { periodId: period.id });
      expect(closed.status).toBe('closed');

      const [emc] = await tx
        .select()
        .from(employeeMonthCosts)
        .where(
          and(
            eq(employeeMonthCosts.organizationId, orgId),
            eq(employeeMonthCosts.employeeId, employee.id),
            eq(employeeMonthCosts.yearMonth, yearMonth),
          ),
        )
        .limit(1);
      expect(emc?.status).toBe('draft');
      expect(emc?.recognitionSource).toBe('time_snapshot');
      expect(emc?.actualAmount).toBe('6400.000000');
      expect(emc?.lockedAt).not.toBeNull();
    });
  });
});
