/**
 * Extra Reviewer1 probes for lifecycle holes (disposable only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createTestDatabase,
  resultRows,
  type TestDatabase,
} from '@tests/setup/database';

describe('PRE-0021 Reviewer1 lifecycle probes', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('applied→closed status transition is allowed after apply', async () => {
    await database.asService(async (db) => {
      const org = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organizations (name, base_currency)
          VALUES ('R1 CloseProbe', 'ILS') RETURNING id
        `),
      )[0]!;
      const emp = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${org.id}, 'Close Emp') RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status
          ) VALUES (${org.id}, ${emp.id}, '2026-08', 'ILS', 100, 100, 'estimated', 'draft')
          RETURNING id
        `),
      )[0]!;
      await db.execute(sql`
        INSERT INTO labor_allocation_runs (
          organization_id, employee_month_cost_id, method, status,
          currency, allocated_amount, unallocated_amount
        ) VALUES (${org.id}, ${month.id}, 'manual_override', 'applied', 'ILS', 0, 100)
      `);

      await db.execute(sql`
        UPDATE employee_month_costs SET status = 'closed', locked_at = now()
        WHERE id = ${month.id}
      `);
      const closed = resultRows<{ status: string }>(
        await db.execute(sql`
          SELECT status FROM employee_month_costs WHERE id = ${month.id}
        `),
      )[0]!;
      expect(closed.status).toBe('closed');
    });
  });

  it('orphan applied month without labor run is rejected', async () => {
    await database.asService(async (db) => {
      const org = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organizations (name, base_currency)
          VALUES ('R1 Orphan', 'ILS') RETURNING id
        `),
      )[0]!;
      const emp = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${org.id}, 'Orphan Emp') RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality,
            status, recognition_source
          ) VALUES (
            ${org.id}, ${emp.id}, '2026-09', 'ILS',
            100, 100, 'estimated',
            'applied', 'monthly_allocated'
          )
        `),
      ).rejects.toThrow(/applied_requires_run|23514|Failed query/i);
    });
  });

  it('draft vendor allocation suppresses header path risk is app-layer (status unfiltered)', async () => {
    // Pure documentation assert - loader must filter status='applied' before READY=true.
    const { resolveVendorBillProjectAmounts } = await import(
      '@/modules/ap/domain/vendor-bill-project-attribution'
    );
    const billId = 'b1';
    const projectId = 'p1';
    // Mimic loader bug: treat draft as "has allocations" and count draft amount.
    const buggy = resolveVendorBillProjectAmounts({
      projectId,
      currency: 'ILS',
      headerBills: [
        { billId, projectId, totalAmount: '1000', currency: 'ILS' },
      ],
      allocationLines: [
        { billId, projectId, amount: '100', currency: 'ILS' }, // draft amount
      ],
      billIdsWithAllocations: new Set([billId]),
    });
    expect(buggy.amounts).toEqual(['100']);
    // Correct behavior for draft-only: should keep header 1000 (no applied lines).
    const correct = resolveVendorBillProjectAmounts({
      projectId,
      currency: 'ILS',
      headerBills: [
        { billId, projectId, totalAmount: '1000', currency: 'ILS' },
      ],
      allocationLines: [],
      billIdsWithAllocations: new Set(), // drafts must not mark bill allocated
    });
    expect(correct.amounts).toEqual(['1000']);
  });
});
