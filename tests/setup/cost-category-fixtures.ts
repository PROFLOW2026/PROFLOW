import { randomUUID } from 'node:crypto';
import { sql, type SQLWrapper } from 'drizzle-orm';
import { resultRows, type TestDatabase } from './database';

type SqlExecutor = {
  execute: (query: string | SQLWrapper) => Promise<unknown>;
};

/** Resolves a seeded transaction cost category for integration fixtures. */
export async function findCostCategoryId(
  database: TestDatabase,
  organizationId: string,
  key = 'materials',
): Promise<string> {
  const rows = await database.asService(async (db) =>
    resultRows<{ id: string }>(
      await db.execute(sql`
        SELECT id FROM cost_categories
        WHERE organization_id = ${organizationId}::uuid AND key = ${key}
        LIMIT 1
      `),
    ),
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`cost category not found: org=${organizationId} key=${key}`);
  }
  return id;
}

/** Adds mandatory 0070 classification fields to AP bill line inputs. */
export function classifyApBillLines<T>(
  lines: T[],
  costCategoryId: string,
): Array<T & { costCategoryId: string; costFamily: 'direct_project' }> {
  return lines.map((line) => ({
    ...line,
    costCategoryId,
    costFamily: 'direct_project' as const,
  }));
}

/** Lookup org `materials` category (from createOrganization provisioning). */
export async function materialsCategoryId(
  tx: SqlExecutor,
  orgId: string,
): Promise<string> {
  const row = resultRows<{ id: string }>(
    await tx.execute(sql`
      SELECT id FROM cost_categories
      WHERE organization_id = ${orgId}::uuid AND key = 'materials'
      LIMIT 1
    `),
  )[0];
  if (row) return row.id;
  throw new Error(`materials cost category missing for organization ${orgId}`);
}

/** Insert default materials category when org was created outside createOrganization. */
export async function ensureMaterialsCategory(
  tx: SqlExecutor,
  orgId: string,
): Promise<string> {
  try {
    return await materialsCategoryId(tx, orgId);
  } catch {
    const id = randomUUID();
    await tx.execute(sql`
      INSERT INTO cost_categories (
        id, organization_id, key, name, family, is_system, sort_order
      ) VALUES (
        ${id}::uuid, ${orgId}::uuid, 'materials', 'Materials', 'direct_project', true, 10
      )
    `);
    return id;
  }
}

/** Drizzle-friendly row for raw finalized expense inserts (net = gross, zero VAT). */
export function zeroVatFinalizedExpenseRow(input: {
  organizationId: string;
  projectId: string;
  costCategoryId: string;
  amount: string;
  expenseDate?: string;
  currency?: string;
}) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    expenseDate: input.expenseDate ?? '2026-02-01',
    netAmount: input.amount,
    grossAmount: input.amount,
    taxAmount: '0',
    currency: input.currency ?? 'ILS',
    vatMode: 'zero' as const,
    status: 'finalized' as const,
    costFamily: 'direct_project' as const,
    costCategoryId: input.costCategoryId,
    classificationStatus: 'classified' as const,
  };
}

/** Fields to spread into createExpense for direct project costs treated as net (no VAT). */
export async function directProjectZeroVatFields(
  tx: SqlExecutor,
  orgId: string,
): Promise<{
  costCategoryId: string;
  costFamily: 'direct_project';
  vatMode: 'zero';
}> {
  return {
    costCategoryId: await materialsCategoryId(tx, orgId),
    costFamily: 'direct_project',
    vatMode: 'zero',
  };
}

/**
 * Insert AP bill as draft + classified line, then promote to open (0070 gate).
 * For tests that previously inserted recognized bills directly.
 */
export async function insertRecognizedApBill(
  db: SqlExecutor,
  input: {
    orgId: string;
    vendorId: string;
    amount: number | string;
    currency?: string;
    projectId?: string | null;
    billDate?: string | null;
  },
): Promise<string> {
  const categoryId = await ensureMaterialsCategory(db, input.orgId);
  const amount = String(input.amount);
  const currency = input.currency ?? 'ILS';

  const bill = resultRows<{ id: string }>(
    await db.execute(sql`
      INSERT INTO ap_bills (
        organization_id, vendor_id, project_id, status, currency,
        total_amount, net_amount, tax_amount, gross_amount, bill_date
      ) VALUES (
        ${input.orgId}::uuid,
        ${input.vendorId}::uuid,
        ${input.projectId ?? null}::uuid,
        'draft',
        ${currency},
        ${amount},
        ${amount},
        0,
        ${amount},
        ${input.billDate ?? null}
      )
      RETURNING id
    `),
  )[0]!;

  await db.execute(sql`
    INSERT INTO ap_bill_lines (
      organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
      net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id, sort_order
    ) VALUES (
      ${input.orgId}::uuid,
      ${bill.id}::uuid,
      'Test line',
      1,
      ${amount},
      ${amount},
      ${amount},
      0,
      ${amount},
      ${currency},
      'classified',
      ${categoryId}::uuid,
      0
    )
  `);

  await db.execute(sql`UPDATE ap_bills SET status = 'open' WHERE id = ${bill.id}::uuid`);
  return bill.id;
}
