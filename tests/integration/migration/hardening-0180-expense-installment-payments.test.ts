/**
 * 0180 expense_installment_payments — SQL contract + DB guard scenarios (local test DB only).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { createProject } from '@/modules/projects';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import {
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG = '0180_expense_installment_payments';
const ILS = 'ILS';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function apply0180(db: TestDatabase) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG}.sql`), 'utf8');
  await db.asService(async (tx) => {
    for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
      await tx.execute(sql.raw(statement));
    }
  });
}

describe('0180 expense_installment_payments', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    await apply0180(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('SQL: partial credits, gross=net+vat, reversal org guard, idempotency indexes', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG}.sql`), 'utf8');
    expect(raw).toContain('expense_installment_payments_gross_net_vat');
    expect(raw).toContain('expense_installment_payment_reversal_guard');
    expect(raw).toContain('cumulative credit exceeds original payment gross');
    expect(raw).toContain('expense_installment_payments_audit_uq');
    expect(raw).toContain('expense_installment_payments_idempotency_uq');
    expect(raw).toContain('install_org_parent_table_rls');
    expect(raw).not.toMatch(/DROP TABLE public\.expenses/i);
  });

  it('DB: allows multiple partial credits until gross cap; blocks over-credit', async () => {
    const owner = await createTestUser(database, 'owner-0180@test.local');
    const orgId = await database.asService(async (db) => {
      const created = await createOrganization(db, owner.id, {
        name: '0180 Org',
        countryCode: 'IL',
      });
      return created.organization.id;
    });

    const expenseId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const project = await createProject(context, { name: '0180 Project' });
      const materials = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id = ${orgId}::uuid AND key = 'materials' LIMIT 1
        `),
      )[0]!.id;
      const draft = await createExpense(context, {
        projectId: project.projectId,
        costCategoryId: materials,
        costFamily: 'direct_project',
        amount: '118',
        currency: ILS,
        expenseDate: '2026-01-01',
        description: '0180 payment test',
      });
      await finalizeExpense(context, draft.id);
      return draft.id;
    });

    const paymentId = await database.asService(async (tx) => {
      const rows = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO expense_installment_payments (
            organization_id, expense_id, installment_index, gross_paid, net_paid, vat_paid,
            actual_paid_at, status
          ) VALUES (
            ${orgId}::uuid, ${expenseId}::uuid, 0, 118, 100, 18, '2026-01-15', 'paid'
          ) RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    await database.asService(async (tx) => {
      await tx.execute(sql`
        INSERT INTO expense_installment_payments (
          organization_id, expense_id, gross_paid, net_paid, vat_paid,
          status, reverses_payment_id
        ) VALUES (
          ${orgId}::uuid, ${expenseId}::uuid, 50, 42.37, 7.63,
          'credited', ${paymentId}::uuid
        )
      `);
      await tx.execute(sql`
        INSERT INTO expense_installment_payments (
          organization_id, expense_id, gross_paid, net_paid, vat_paid,
          status, reverses_payment_id
        ) VALUES (
          ${orgId}::uuid, ${expenseId}::uuid, 60, 50.85, 9.15,
          'credited', ${paymentId}::uuid
        )
      `);
    });

    await expect(
      database.asService(async (tx) => {
        await tx.execute(sql`
          INSERT INTO expense_installment_payments (
            organization_id, expense_id, gross_paid, net_paid, vat_paid,
            status, reverses_payment_id
          ) VALUES (
            ${orgId}::uuid, ${expenseId}::uuid, 10, 8.47, 1.53,
            'credited', ${paymentId}::uuid
          )
        `);
      }),
    ).rejects.toSatisfy((err: unknown) => /cumulative credit exceeds/i.test(errorBlob(err)));
  });

  it('DB: idempotency_key prevents duplicate insert', async () => {
    const orgId = resultRows<{ id: string }>(
      await database.asService((tx) =>
        tx.execute(sql`SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1`),
      ),
    )[0]!.id;
    const expenseId = resultRows<{ id: string }>(
      await database.asService((tx) =>
        tx.execute(sql`SELECT id FROM expenses WHERE organization_id = ${orgId}::uuid LIMIT 1`),
      ),
    )[0]!.id;

    await database.asService(async (tx) => {
      await tx.execute(sql`
        INSERT INTO expense_installment_payments (
          organization_id, expense_id, gross_paid, net_paid, vat_paid,
          actual_paid_at, status, idempotency_key
        ) VALUES (
          ${orgId}::uuid, ${expenseId}::uuid, 10, 8.47, 1.53,
          '2026-02-01', 'paid', 'idem-0180-test'
        )
      `);
    });

    await expect(
      database.asService(async (tx) => {
        await tx.execute(sql`
          INSERT INTO expense_installment_payments (
            organization_id, expense_id, gross_paid, net_paid, vat_paid,
            actual_paid_at, status, idempotency_key
          ) VALUES (
            ${orgId}::uuid, ${expenseId}::uuid, 10, 8.47, 1.53,
            '2026-02-02', 'paid', 'idem-0180-test'
          )
        `);
      }),
    ).rejects.toSatisfy((err: unknown) => /unique|duplicate|idempotency/i.test(errorBlob(err)));
  });
});
