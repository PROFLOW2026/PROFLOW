import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { employeeMonthCosts } from '@drizzle/schema';
import { createApBill, voidApBill } from '@/modules/ap';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { getExpense } from '@/modules/expenses/application/queries';
import { voidExpense } from '@/modules/expenses/application/void-expense';
import {
  closeMonthClosePeriod,
  createMonthCloseAdjustment,
  ensureMonthClosePeriod,
  getMonthClosePeriodDetail,
  markMonthCloseReady,
} from '@/modules/month-close';
import { createProject } from '@/modules/projects';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createVendor } from '@/modules/vendors';
import {
  correctTimeEntry,
  createEmployee,
  createTimeEntry,
  findTimeEntryById,
  listNonProjectCodes,
} from '@/modules/workforce';
import { businessDate } from '@/shared/dates';
import { ConflictError, type DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

async function provisionTenant(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) =>
    createOrganization(db, owner.id, { name, countryCode: 'IL' }),
  );
}

async function closeMonth(context: OrgContext, yearMonth: string) {
  const period = await ensureMonthClosePeriod(context, { yearMonth });
  try {
    await markMonthCloseReady(context, { periodId: period.id });
  } catch (error) {
    const latest = await ensureMonthClosePeriod(context, { yearMonth });
    throw new Error(
      `Could not mark ${yearMonth} ready (${String(error)}). Completeness=${latest.completenessSnapshot?.percent} items=${JSON.stringify(latest.completenessSnapshot?.items)}`,
    );
  }
  const closed = await closeMonthClosePeriod(context, { periodId: period.id });
  expect(closed.status).toBe('closed');
  return closed;
}

describe('closed-period source corrections (coherence)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let projectId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);

    owner = await createTestUser(database, 'closed-period-owner@example.test');
    const org = await provisionTenant(database, owner, 'Closed Period Coherence');
    orgId = org.organization.id;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const created = await createProject(context, { name: 'Closed-period site' });
      projectId = created.projectId;
    });
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('voids an expense in an open month and blocks void after close', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const openExpense = await createExpense(context, {
        amount: '80',
        currency: 'ILS',
        description: 'Open-month materials',
        expenseDate: '2026-02-12',
        projectId,
        costFamily: 'direct_project',
      });
      await finalizeExpense(context, openExpense.id);
      const voided = await voidExpense(context, openExpense.id);
      expect(voided.status).toBe('void');

      const closedExpense = await createExpense(context, {
        amount: '90',
        currency: 'ILS',
        description: 'Closed-month materials',
        expenseDate: '2026-03-12',
        projectId,
        costFamily: 'direct_project',
      });
      await finalizeExpense(context, closedExpense.id);
      await closeMonth(context, '2026-03');

      await expect(voidExpense(context, closedExpense.id)).rejects.toMatchObject({
        messageKey: 'monthClose.errors.useCorrectionNotRewrite',
      } satisfies Partial<DomainRuleError>);
      const stillFinal = await getExpense(context, closedExpense.id);
      expect(stillFinal.status).toBe('finalized');
    });
  });

  it('voids an AP bill in an open month and blocks void after close', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const vendor = await createVendor(context, { name: 'Coherence Vendor' });

      const openBill = await createApBill(context, {
        vendorId: vendor.id,
        projectId,
        currency: 'ILS',
        totalAmount: '200',
        billDate: '2026-04-05',
        lines: [{ description: 'Open month', quantity: '1', unitAmount: '200', lineTotal: '200', currency: 'ILS' }],
      });
      const voided = await voidApBill(context, { billId: openBill.id });
      expect(voided.status).toBe('void');

      const closedBill = await createApBill(context, {
        vendorId: vendor.id,
        projectId,
        currency: 'ILS',
        totalAmount: '150',
        billDate: '2026-05-05',
        lines: [{ description: 'Closed month', quantity: '1', unitAmount: '150', lineTotal: '150', currency: 'ILS' }],
      });
      await closeMonth(context, '2026-05');

      await expect(voidApBill(context, { billId: closedBill.id })).rejects.toMatchObject({
        messageKey: 'monthClose.errors.useCorrectionNotRewrite',
      } satisfies Partial<DomainRuleError>);
    });
  });

  it('accepts a revenue-side closed-period adjustment and keeps source insert working', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const closed = await closeMonth(context, '2026-01');
      const revenue = await createMonthCloseAdjustment(context, {
        periodId: closed.id,
        adjustmentType: 'adjustment',
        reason: 'Late invoice recognition',
        amount: '40',
        currency: 'ILS',
        effectSide: 'revenue',
        projectId,
      });
      expect(revenue.effectSide).toBe('revenue');
      expect(revenue.amount).toBe('40.000000');

      const cost = await createMonthCloseAdjustment(context, {
        periodId: closed.id,
        reason: 'Missed cost after close',
        amount: '-12',
        currency: 'ILS',
        effectSide: 'cost',
        projectId,
      });
      expect(cost.effectSide).toBe('cost');

      const detail = await getMonthClosePeriodDetail(context, closed.id);
      expect(detail.adjustments.some((row) => row.id === revenue.id)).toBe(true);
      expect(detail.adjustments.some((row) => row.id === cost.id)).toBe(true);
    });
  });

  it('voids a time entry in an open month and posts a month-close cost delta when closed', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });

      const openEmployee = await createEmployee(context, {
        name: 'Open-month worker',
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
        validFrom: businessDate('2026-01-01'),
      });
      const openEntry = await createTimeEntry(context, {
        employeeId: openEmployee.id,
        workDate: businessDate('2026-06-10'),
        hours: '8',
        kind: 'project',
        projectId,
      });
      const openCorrection = await correctTimeEntry(context, {
        correctsEntryId: openEntry.id,
        employeeId: openEmployee.id,
        workDate: businessDate('2026-06-10'),
        hours: '6',
        kind: 'project',
        projectId,
      });
      expect(openCorrection.mode).toBe('void_replace');
      if (openCorrection.mode !== 'void_replace') throw new Error('expected void_replace');
      expect(openCorrection.voided.status).toBe('void');
      expect(openCorrection.replacement.status).toBe('recorded');
      expect(Number(openCorrection.replacement.hours)).toBe(6);

      const closedEmployee = await createEmployee(context, {
        name: 'Closed-month worker',
        rateUnit: 'hourly',
        baseRate: '100',
        currency: 'ILS',
        validFrom: businessDate('2026-01-01'),
      });
      const closedEntry = await createTimeEntry(context, {
        employeeId: closedEmployee.id,
        workDate: businessDate('2026-07-10'),
        hours: '8',
        kind: 'project',
        projectId,
      });
      expect(closedEntry.costAmount).toBe('800.000000');

      await tx.insert(employeeMonthCosts).values({
        organizationId: orgId,
        employeeId: closedEmployee.id,
        yearMonth: '2026-07',
        currency: 'ILS',
        knownAmount: '800',
        actualAmount: '800',
        knownQuality: 'actual',
        status: 'draft',
      });

      const period = await closeMonth(context, '2026-07');
      const closedCorrection = await correctTimeEntry(context, {
        correctsEntryId: closedEntry.id,
        employeeId: closedEmployee.id,
        workDate: businessDate('2026-07-10'),
        hours: '6',
        kind: 'project',
        projectId,
      });
      expect(closedCorrection.mode).toBe('closed_period_adjustment');
      if (closedCorrection.mode !== 'closed_period_adjustment') {
        throw new Error('expected closed_period_adjustment');
      }

      const originalAfter = await findTimeEntryById(tx, orgId, closedEntry.id);
      expect(originalAfter?.status).toBe('recorded');
      expect(originalAfter?.hours).toBe(closedEntry.hours);
      expect(originalAfter?.voidedAt).toBeNull();

      const detail = await getMonthClosePeriodDetail(context, period.id);
      const adjustment = detail.adjustments.find(
        (row) => row.id === closedCorrection.adjustmentId,
      );
      expect(adjustment?.effectSide).toBe('cost');
      expect(adjustment?.entityType).toBe('time_entry');
      expect(adjustment?.entityId).toBe(closedEntry.id);
      expect(adjustment?.amount).toBe('-200.000000');
      expect(adjustment?.projectId).toBe(projectId);
    });
  });

  it('refuses a closed-month time correction without a project', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const employee = await createEmployee(context, {
        name: 'Overhead time worker',
        rateUnit: 'hourly',
        baseRate: '50',
        currency: 'ILS',
        validFrom: businessDate('2026-01-01'),
      });
      const codes = await listNonProjectCodes(context);
      const timeCodeId = codes[0]?.id;
      if (!timeCodeId) throw new Error('expected default time codes');

      const entry = await createTimeEntry(context, {
        employeeId: employee.id,
        workDate: businessDate('2026-08-04'),
        hours: '4',
        kind: 'non_project',
        timeCodeId,
      });

      await tx.insert(employeeMonthCosts).values({
        organizationId: orgId,
        employeeId: employee.id,
        yearMonth: '2026-08',
        currency: 'ILS',
        knownAmount: '200',
        actualAmount: '200',
        knownQuality: 'actual',
        status: 'draft',
      });
      await closeMonth(context, '2026-08');

      await expect(
        correctTimeEntry(context, {
          correctsEntryId: entry.id,
          employeeId: employee.id,
          workDate: businessDate('2026-08-04'),
          hours: '2',
          kind: 'non_project',
          timeCodeId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
