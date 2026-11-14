/**
 * PGlite harness: proves loader returns Date instances (not browser E2E).
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employeePayrollPayments,
  employees,
  organizationMemberships,
  organizations,
  profiles,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { loadMonthlyEmployerCostReview, saveMonthlyEmployerCostDraft } from '@/modules/workforce';
import { setEmployeeMonthCostsReadyForTests } from '@/modules/workforce/domain/monthly-cost-gates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(evidenceDir, 'logs');

function writeLog(name: string, payload: unknown) {
  mkdirSync(logDir, { recursive: true });
  writeFileSync(path.join(logDir, name), JSON.stringify(payload, null, 2));
}

describe('BUG-02 pglite loader shapes', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let employeeWithHistoryId: string;
  let employeeNoHistoryId: string;
  const yearMonth = '2026-10';

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    setEmployeeMonthCostsReadyForTests(true);
    orgId = randomUUID();
    userId = randomUUID();
    employeeWithHistoryId = randomUUID();
    employeeNoHistoryId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);
      await db.insert(profiles).values({
        id: userId,
        email: 'bug02-runtime@example.test',
        displayName: 'BUG02 Owner',
      });
      await db.insert(organizations).values({
        id: orgId,
        name: 'BUG02 Org',
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
      await db.insert(employees).values([
        {
          id: employeeWithHistoryId,
          organizationId: orgId,
          name: 'עובד עם היסטוריית עלות',
          status: 'active',
        },
        {
          id: employeeNoHistoryId,
          organizationId: orgId,
          name: 'עובד בלי היסטוריה',
          status: 'active',
        },
      ]);
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'he-IL' });
      await saveMonthlyEmployerCostDraft(context, {
        employeeId: employeeWithHistoryId,
        yearMonth,
        estimatedAmount: '8250',
        currency: 'ILS',
      });

      const paymentId = randomUUID();
      await tx.insert(employeePayrollPayments).values({
      id: paymentId,
      organizationId: orgId,
      employeeId: employeeWithHistoryId,
      yearMonth,
      currency: 'ILS',
      expectedAmount: '8250.000000',
      paidAmount: null,
      dueDate: '2026-10-31',
      paymentStatus: 'due',
      paidAt: null,
      paymentConfirmationSource: null,
      notes: null,
      voidedAt: null,
        });
      writeLog('pglite-seed.json', {
        orgId,
        employeeWithHistoryId,
        employeeNoHistoryId,
        yearMonth,
        paymentId,
      });
    });
  });

  it('loadMonthlyEmployerCostReview returns Drizzle Date fields when EMC history exists', async () => {
    const review = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'he-IL' });
      return loadMonthlyEmployerCostReview(context, {
        employeeId: employeeWithHistoryId,
        yearMonth,
      });
    });

    expect(review.month).not.toBeNull();
    expect(review.month?.createdAt).toBeInstanceOf(Date);
    expect(review.months.length).toBeGreaterThan(0);
    expect(review.months[0]?.createdAt).toBeInstanceOf(Date);

    writeLog('pglite-review-with-history.json', {
      yearMonth: review.yearMonth,
      monthsCount: review.months.length,
      monthCreatedAtType: typeof review.month?.createdAt,
      monthCreatedAtIsDate: review.month?.createdAt instanceof Date,
      monthCreatedAtIso: review.month?.createdAt?.toISOString(),
    });
  });

  it('employee without EMC history returns empty months (showMonthReview false on payroll path)', async () => {
    const review = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'he-IL' });
      return loadMonthlyEmployerCostReview(context, {
        employeeId: employeeNoHistoryId,
        yearMonth,
      });
    });

    const showMonthReview = Boolean(review.month || review.months.length > 0);
    expect(showMonthReview).toBe(false);

    writeLog('pglite-review-no-history.json', {
      yearMonth: review.yearMonth,
      monthsCount: review.months.length,
      showMonthReview,
    });
  });

  it('confirms employee_month_costs row timestamp mode in DB', async () => {
    const row = await database.asService(async (db) => {
      const [found] = await db
        .select()
        .from(employeeMonthCosts)
        .where(
          and(
            eq(employeeMonthCosts.organizationId, orgId),
            eq(employeeMonthCosts.employeeId, employeeWithHistoryId),
          ),
        )
        .limit(1);
      return found;
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
    writeLog('pglite-emc-row-types.json', {
      createdAtIsDate: row?.createdAt instanceof Date,
      updatedAtIsDate: row?.updatedAt instanceof Date,
    });
  });
});
