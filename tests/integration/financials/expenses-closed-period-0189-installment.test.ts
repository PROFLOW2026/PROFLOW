/**
 * F13 / 0189 — closed expense month allows late payment flag; closed payment month blocks ledger writes.
 */
import { and, eq, sql } from 'drizzle-orm';
import { costCategories, expenseInstallmentPayments, expenses } from '@drizzle/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { confirmExpensePaid } from '@/modules/expenses/application/expense-payments';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import {
  closeMonthClosePeriod,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import {
  applyGateAFinancialIntegrationMigrations,
  insertMinimalProject,
} from '@tests/setup/financial-integration-pglite';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

const ILS = 'ILS';

function errorChainText(error: unknown): string {
  const parts: string[] = [];
  let cur: unknown = error;
  for (let depth = 0; depth < 8 && cur != null; depth += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
      continue;
    }
    if (typeof cur === 'object') {
      const record = cur as Record<string, unknown>;
      if (typeof record.message === 'string') parts.push(record.message);
      if (typeof record.detail === 'string') parts.push(record.detail);
      cur = record.cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return parts.join(' | ');
}

async function closeMonth(context: OrgContext, yearMonth: string) {
  const period = await ensureMonthClosePeriod(context, { yearMonth });
  await markMonthCloseReady(context, { periodId: period.id });
  const closed = await closeMonthClosePeriod(context, { periodId: period.id });
  expect(closed.status).toBe('closed');
}

describe('F13 — 0189 closed period + installment payment (PGlite)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let materialsCategoryId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyGateAFinancialIntegrationMigrations(database);
    await seedSystem(database);

    owner = await createTestUser(database, 'f13-0189-owner@test.local');
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'F13 0189 org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;

    const categoryRows = await database.asService(async (db) =>
      db
        .select({ id: costCategories.id, key: costCategories.key })
        .from(costCategories)
        .where(eq(costCategories.organizationId, orgId)),
    );
    materialsCategoryId = categoryRows.find((row) => row.key === 'materials')!.id;
  });

  afterAll(async () => {
    await database.close();
  });

  it('paying in an open month after expense month closed sets paid_after_period_close and ledger row', async () => {
    const expenseId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const projectId = await insertMinimalProject(tx, orgId, 'F13 late pay');
      const draft = await createExpense(context, {
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        expenseDate: '2026-01-15',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
        description: 'Closed expense month late pay',
      });
      await finalizeExpense(context, draft.id);
      await closeMonth(context, '2026-01');
      return draft.id;
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      await confirmExpensePaid(context, expenseId, {
        paidAt: businessDate('2026-03-15'),
        paidGrossAmount: '1180.000000',
      });
    });

    const flagRow = await database.asService(async (db) =>
      resultRows<{ paidAfterPeriodClose: boolean }>(
        await db.execute(sql`
          SELECT paid_after_period_close AS "paidAfterPeriodClose"
          FROM expenses WHERE id = ${expenseId}::uuid
        `),
      ),
    );
    expect(flagRow[0]?.paidAfterPeriodClose).toBe(true);

    const ledgerRows = await database.asUser(owner.id, async (tx) =>
      tx
        .select({
          status: expenseInstallmentPayments.status,
          actualPaidAt: expenseInstallmentPayments.actualPaidAt,
        })
        .from(expenseInstallmentPayments)
        .where(
          and(
            eq(expenseInstallmentPayments.organizationId, orgId),
            eq(expenseInstallmentPayments.expenseId, expenseId),
            eq(expenseInstallmentPayments.status, 'paid'),
          ),
        ),
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]!.actualPaidAt).toBe('2026-03-15');
  });

  it('blocks confirmExpensePaid when payment month is closed (0189 ledger guard)', async () => {
    const expenseId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const projectId = await insertMinimalProject(tx, orgId, 'F13 closed pay month');
      const draft = await createExpense(context, {
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        expenseDate: '2026-04-01',
        installmentCount: 12,
        installmentStartDate: '2026-04-01',
        description: 'Blocked closed payment month',
      });
      await finalizeExpense(context, draft.id);
      await closeMonth(context, '2026-03');
      return draft.id;
    });

    let payError: unknown;
    try {
      await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId: orgId,
          locale: 'en',
        });
        await confirmExpensePaid(context, expenseId, {
          paidAt: businessDate('2026-03-15'),
          paidGrossAmount: '1180.000000',
        });
      });
    } catch (error) {
      payError = error;
    }
    expect(payError).toBeTruthy();
    expect(errorChainText(payError)).toMatch(/closed_period_immutable/);

    const stillUnpaid = await database.asService(async (db) =>
      db
        .select({ paidAt: expenses.paidAt })
        .from(expenses)
        .where(eq(expenses.id, expenseId)),
    );
    expect(stillUnpaid[0]?.paidAt).toBeNull();
  });
});
