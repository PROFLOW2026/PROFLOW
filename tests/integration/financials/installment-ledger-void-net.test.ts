/**
 * F04 — expense_installment_payments writes from confirm/void + void netting (PGlite).
 */
import { and, eq, sql } from 'drizzle-orm';
import { costCategories, expenseInstallmentPayments } from '@drizzle/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExpense } from '@/modules/expenses/application/create-expense';
import {
  confirmExpensePaid,
  voidExpensePaymentConfirmation,
} from '@/modules/expenses/application/expense-payments';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { loadVerifiedInstallmentPaymentsByExpenseIds } from '@/modules/expenses/data/expense-installment-payments.repository';
import { recognizedExpenseNetInYearMonth } from '@/modules/expenses/domain/installment-payment-recognition';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import {
  applyGateAFinancialIntegrationMigrations,
  insertMinimalProject,
} from '@tests/setup/financial-integration-pglite';
import { businessDate } from '@/shared/dates';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

const ILS = 'ILS';

describe('F04 — installment ledger void netting (PGlite)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let materialsCategoryId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyGateAFinancialIntegrationMigrations(database);
    await seedSystem(database);

    owner = await createTestUser(database, 'f04-ledger-owner@test.local');
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'F04 Ledger Org', countryCode: 'IL' }),
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

  it('paid ledger row fully voided via reverses_payment_id yields no verified slices', async () => {
    const expenseRow = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const projectId = await insertMinimalProject(tx, orgId, 'F04 ledger void');
      const draft = await createExpense(context, {
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
        description: 'F04 ledger void',
      });
      await finalizeExpense(context, draft.id);
      return {
        id: draft.id,
        grossAmount: draft.grossAmount.amount,
        currency: draft.grossAmount.currency,
        installmentCount: draft.installmentCount,
        installmentStartDate: draft.installmentStartDate,
        expenseDate: draft.expenseDate,
        cashInstallmentSchedule: draft.cashInstallmentSchedule,
        installmentsPaidCount: draft.installmentsPaidCount ?? 0,
        paidGrossAmount: draft.paidGrossAmount ?? null,
        paidAt: draft.paidAt,
      };
    });

    const paymentId = await database.asService(async (tx) => {
      const rows = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO expense_installment_payments (
            organization_id, expense_id, installment_index, gross_paid, net_paid, vat_paid,
            actual_paid_at, status
          ) VALUES (
            ${orgId}::uuid, ${expenseRow.id}::uuid, 0, 1180, 1000, 180, '2026-03-15', 'paid'
          ) RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    await database.asService(async (tx) => {
      await tx.execute(sql`
        INSERT INTO expense_installment_payments (
          organization_id, expense_id, installment_index, gross_paid, net_paid, vat_paid,
          status, reverses_payment_id
        ) VALUES (
          ${orgId}::uuid, ${expenseRow.id}::uuid, 0, 1180, 1000, 180,
          'voided', ${paymentId}::uuid
        )
      `);
    });

    const verified = await database.asUser(owner.id, async (tx) => {
      const map = await loadVerifiedInstallmentPaymentsByExpenseIds(tx, orgId, [expenseRow]);
      return map.get(expenseRow.id) ?? [];
    });

    expect(verified).toHaveLength(0);
  });

  it('confirmExpensePaid writes paid ledger row; void writes reversal and clears recognition', async () => {
    const expense = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const projectId = await insertMinimalProject(tx, orgId, 'F04 confirm void ledger');
      const draft = await createExpense(context, {
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
        description: 'F04 confirm void ledger',
      });
      await finalizeExpense(context, draft.id);
      return { id: draft.id, cashInstallmentSchedule: draft.cashInstallmentSchedule };
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      await confirmExpensePaid(context, expense.id, {
        paidAt: businessDate('2026-03-15'),
        paidGrossAmount: '1180.000000',
      });
    });

    const paidRows = await database.asUser(owner.id, async (tx) =>
      tx
        .select({
          status: expenseInstallmentPayments.status,
          installmentIndex: expenseInstallmentPayments.installmentIndex,
          grossPaid: expenseInstallmentPayments.grossPaid,
          actualPaidAt: expenseInstallmentPayments.actualPaidAt,
          auditEventId: expenseInstallmentPayments.auditEventId,
          idempotencyKey: expenseInstallmentPayments.idempotencyKey,
        })
        .from(expenseInstallmentPayments)
        .where(
          and(
            eq(expenseInstallmentPayments.organizationId, orgId),
            eq(expenseInstallmentPayments.expenseId, expense.id),
          ),
        ),
    );

    expect(paidRows.filter((r) => r.status === 'paid')).toHaveLength(1);
    const paid = paidRows.find((r) => r.status === 'paid')!;
    expect(paid.installmentIndex).toBe(0);
    expect(String(paid.grossPaid)).toBe('1180.000000');
    expect(paid.actualPaidAt).toBe('2026-03-15');
    expect(paid.auditEventId).toBeTruthy();
    expect(paid.idempotencyKey).toBe(`expense:${expense.id}:inst:0:${paid.auditEventId}`);

    const verifiedAfterPay = await database.asUser(owner.id, async (tx) => {
      const map = await loadVerifiedInstallmentPaymentsByExpenseIds(tx, orgId, [
        {
          id: expense.id,
          grossAmount: '14160.000000',
          currency: ILS,
          installmentCount: 12,
          installmentStartDate: '2026-01-01',
          expenseDate: '2026-01-01',
          cashInstallmentSchedule: expense.cashInstallmentSchedule,
          installmentsPaidCount: 1,
          paidGrossAmount: '1180.000000',
          paidAt: '2026-03-15',
        },
      ]);
      return map.get(expense.id) ?? [];
    });

    expect(verifiedAfterPay).toHaveLength(1);
    expect(verifiedAfterPay[0]!.source).toBe('ledger');
    const netMarch = recognizedExpenseNetInYearMonth(
      {
        grossAmount: '14160.000000',
        netAmount: '12000.000000',
        currency: ILS,
        installmentCount: 12,
        installmentStartDate: businessDate('2026-01-01'),
        expenseDate: businessDate('2026-01-01'),
        cashInstallmentSchedule: expense.cashInstallmentSchedule,
        verifiedInstallmentPayments: verifiedAfterPay,
        installmentsPaidCount: 1,
        paidGrossAmount: '1180.000000',
        paidAt: businessDate('2026-03-15'),
      },
      '2026-03',
    );
    expect(Number(netMarch?.amount)).toBeCloseTo(1000, 2);

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      await voidExpensePaymentConfirmation(context, expense.id);
    });

    const ledgerAfterVoid = await database.asUser(owner.id, async (tx) =>
      tx
        .select({
          status: expenseInstallmentPayments.status,
          reversesPaymentId: expenseInstallmentPayments.reversesPaymentId,
        })
        .from(expenseInstallmentPayments)
        .where(
          and(
            eq(expenseInstallmentPayments.organizationId, orgId),
            eq(expenseInstallmentPayments.expenseId, expense.id),
          ),
        ),
    );

    expect(ledgerAfterVoid.some((r) => r.status === 'paid')).toBe(true);
    const voidRow = ledgerAfterVoid.find((r) => r.status === 'voided');
    expect(voidRow).toBeTruthy();
    expect(voidRow!.reversesPaymentId).toBeTruthy();

    const verifiedAfterVoid = await database.asUser(owner.id, async (tx) => {
      const map = await loadVerifiedInstallmentPaymentsByExpenseIds(tx, orgId, [
        {
          id: expense.id,
          grossAmount: '14160.000000',
          currency: ILS,
          installmentCount: 12,
          installmentStartDate: '2026-01-01',
          expenseDate: '2026-01-01',
          cashInstallmentSchedule: expense.cashInstallmentSchedule,
          installmentsPaidCount: 0,
          paidGrossAmount: null,
          paidAt: null,
        },
      ]);
      return map.get(expense.id) ?? [];
    });
    expect(verifiedAfterVoid).toHaveLength(0);
  });
});
