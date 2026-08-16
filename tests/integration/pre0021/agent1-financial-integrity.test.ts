import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import {
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  type TestDatabase,
} from '@tests/setup/database';
import {
  applyMigrationsAndAgent1Patch,
  isContendedConnectionError,
  isIntegrityFailure,
  openTwoConnectionHarness,
} from './two-connection';

const PATCH_PATH = path.resolve(
  process.cwd(),
  'tests/integration/pre0021/agent1-integrity-patch.sql',
);

async function applyAgent1Patch(database: TestDatabase): Promise<void> {
  const raw = await readFile(PATCH_PATH, 'utf8');
  await database.asService(async (db) => {
    for (const statement of splitSqlStatements(raw)) {
      await db.execute(sql.raw(statement));
    }
  });
}

async function seedOrg(db: TestDatabase['db']) {
  const org = resultRows<{ id: string }>(
    await db.execute(sql`
      INSERT INTO organizations (name, base_currency)
      VALUES ('Agent1 Integrity Org', 'ILS')
      RETURNING id
    `),
  )[0]!;
  return org.id;
}

/**
 * Desired A–I behavior after Lead folds Agent 1 SQL into 0021.
 * Applies disposable patch on top of current migrations (does not edit 0021).
 */
describe('PRE-0021 Agent 1 financial/data integrity (patched)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyAgent1Patch(database);
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('A: blocks economic UPDATE on applied month; allows draft; supersede path', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${orgId}, 'Immutable Worker')
          RETURNING id
        `),
      )[0]!;

      const draft = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status
          )
          VALUES (
            ${orgId}, ${employee.id}, '2026-04', 'ILS',
            1000, 1000, 'estimated', 'draft'
          )
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        UPDATE employee_month_costs
        SET known_amount = 1100, estimated_amount = 1100
        WHERE id = ${draft.id}
      `);

      await db.execute(sql`
        INSERT INTO labor_allocation_runs (
          organization_id, employee_month_cost_id, method, status,
          currency, allocated_amount, unallocated_amount
        )
        VALUES (
          ${orgId}, ${draft.id}, 'manual_override', 'applied',
          'ILS', 0, 1100
        )
      `);

      const applied = resultRows<{ status: string; recognition_source: string }>(
        await db.execute(sql`
          SELECT status, recognition_source
          FROM employee_month_costs WHERE id = ${draft.id}
        `),
      )[0]!;
      expect(applied.status).toBe('applied');
      expect(applied.recognition_source).toBe('monthly_allocated');

      await expect(
        db.execute(sql`
          UPDATE employee_month_costs
          SET known_amount = 999, estimated_amount = 999
          WHERE id = ${draft.id}
        `),
      ).rejects.toThrow(/employee_month_costs_immutable|23514|Failed query/i);

      await db.execute(sql`
        UPDATE employee_month_costs
        SET status = 'superseded'
        WHERE id = ${draft.id}
      `);

      const correction = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status, adjusts_month_id
          )
          VALUES (
            ${orgId}, ${employee.id}, '2026-04', 'ILS',
            1200, 1200, 'estimated', 'draft', ${draft.id}
          )
          RETURNING id
        `),
      );
      expect(correction).toHaveLength(1);
    });
  });

  it('B: rejects invalid calendar months and incoherent quality/amounts', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${orgId}, 'Calendar Worker')
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency, known_amount
          )
          VALUES (${orgId}, ${employee.id}, '2026-13', 'ILS', 100)
        `),
      ).rejects.toThrow(/year_month|23514|Failed query/i);

      await expect(
        db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency, known_amount
          )
          VALUES (${orgId}, ${employee.id}, '2026-00', 'ILS', 100)
        `),
      ).rejects.toThrow(/year_month|23514|Failed query/i);

      await expect(
        db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            known_amount, known_quality, actual_amount
          )
          VALUES (
            ${orgId}, ${employee.id}, '2026-05', 'ILS',
            100, 'actual', NULL
          )
        `),
      ).rejects.toThrow(/quality_amount_coherent|23514|Failed query/i);

      const ok = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality
          )
          VALUES (
            ${orgId}, ${employee.id}, '2026-05', 'ILS',
            250, 250, 'estimated'
          )
          RETURNING id
        `),
      );
      expect(ok).toHaveLength(1);
    });
  });

  it('C: enforces month=run=lines currency and vendor alloc=bill currency', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${orgId}, 'FX Worker')
          RETURNING id
        `),
      )[0]!;
      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${orgId}, 'FX Project')
          RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality
          )
          VALUES (${orgId}, ${employee.id}, '2026-06', 'ILS', 500, 500, 'estimated')
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          )
          VALUES (
            ${orgId}, ${month.id}, 'manual_override', 'draft',
            'USD', 0, 500
          )
        `),
      ).rejects.toThrow(/labor_allocation_currency_mismatch|23514|Failed query/i);

      const run = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          )
          VALUES (
            ${orgId}, ${month.id}, 'manual_override', 'draft',
            'ILS', 200, 300
          )
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_run_lines (
            organization_id, labor_allocation_run_id, project_id,
            amount, currency
          )
          VALUES (${orgId}, ${run.id}, ${project.id}, 200, 'USD')
        `),
      ).rejects.toThrow(/labor_allocation_currency_mismatch|23514|Failed query/i);

      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name)
          VALUES (${orgId}, 'Currency Vendor')
          RETURNING id
        `),
      )[0]!;
      const bill = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, status, currency, total_amount
          )
          VALUES (${orgId}, ${vendor.id}, 'open', 'ILS', 1000)
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          )
          VALUES (
            ${orgId}, ${bill.id}, 'project', ${project.id},
            'manual_amount', 100, 'USD', 'draft'
          )
        `),
      ).rejects.toThrow(/ap_bill_project_allocations_currency_mismatch|23514|Failed query/i);
    });
  });

  it('D: labor line percent/hours/days bounds + conservation on apply', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${orgId}, 'Line Worker')
          RETURNING id
        `),
      )[0]!;
      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${orgId}, 'Line Project')
          RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality
          )
          VALUES (${orgId}, ${employee.id}, '2026-07', 'ILS', 1000, 1000, 'estimated')
          RETURNING id
        `),
      )[0]!;
      const run = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          )
          VALUES (
            ${orgId}, ${month.id}, 'percent', 'draft',
            'ILS', 0, 1000
          )
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_run_lines (
            organization_id, labor_allocation_run_id, project_id,
            amount, currency, percent
          )
          VALUES (${orgId}, ${run.id}, ${project.id}, 100, 'ILS', 150)
        `),
      ).rejects.toThrow(/percent_range|23514|Failed query/i);

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_run_lines (
            organization_id, labor_allocation_run_id, project_id,
            amount, currency, basis_hours
          )
          VALUES (${orgId}, ${run.id}, ${project.id}, 100, 'ILS', -1)
        `),
      ).rejects.toThrow(/hours_non_negative|23514|Failed query/i);

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_run_lines (
            organization_id, labor_allocation_run_id, project_id,
            amount, currency, basis_days
          )
          VALUES (${orgId}, ${run.id}, ${project.id}, 100, 'ILS', -0.5)
        `),
      ).rejects.toThrow(/days_non_negative|23514|Failed query/i);

      await db.execute(sql`
        INSERT INTO labor_allocation_run_lines (
          organization_id, labor_allocation_run_id, project_id,
          amount, currency, percent, basis_hours, basis_days
        )
        VALUES (${orgId}, ${run.id}, ${project.id}, 600, 'ILS', 60, 10, 2)
      `);

      await expect(
        db.execute(sql`
          UPDATE labor_allocation_runs
          SET status = 'applied', allocated_amount = 600, unallocated_amount = 300
          WHERE id = ${run.id}
        `),
      ).rejects.toThrow(/conservation_failed|23514|Failed query/i);

      await db.execute(sql`
        UPDATE labor_allocation_runs
        SET status = 'applied', allocated_amount = 600, unallocated_amount = 400
        WHERE id = ${run.id}
      `);
    });
  });

  it('E/G: vendor active SUM never exceeds bill NET; draft→applied→superseded', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const projectA = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${orgId}, 'Vendor Proj A')
          RETURNING id
        `),
      )[0]!;
      const projectB = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${orgId}, 'Vendor Proj B')
          RETURNING id
        `),
      )[0]!;
      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name)
          VALUES (${orgId}, 'NET Vendor')
          RETURNING id
        `),
      )[0]!;
      const bill = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, status, currency, total_amount
          )
          VALUES (${orgId}, ${vendor.id}, 'open', 'ILS', 1000)
          RETURNING id
        `),
      )[0]!;

      // Payment must NOT raise the allocation ceiling.
      const payment = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_payments (
            organization_id, vendor_id, amount, currency, payment_date, status
          )
          VALUES (${orgId}, ${vendor.id}, 5000, 'ILS', '2026-08-01', 'recorded')
          RETURNING id
        `),
      )[0]!;
      await db.execute(sql`
        INSERT INTO ap_payment_applications (
          organization_id, ap_payment_id, ap_bill_id, applied_amount, currency
        )
        VALUES (${orgId}, ${payment.id}, ${bill.id}, 1000, 'ILS')
      `);

      const draft = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          )
          VALUES (
            ${orgId}, ${bill.id}, 'project', ${projectA.id},
            'manual_amount', 700, 'ILS', 'draft'
          )
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          )
          VALUES (
            ${orgId}, ${bill.id}, 'project', ${projectB.id},
            'manual_amount', 400, 'ILS', 'draft'
          )
        `),
      ).rejects.toThrow(/ap_bill_project_allocations_over_bill_net|23514|Failed query/i);

      await db.execute(sql`
        UPDATE ap_bill_project_allocations
        SET status = 'applied'
        WHERE id = ${draft.id}
      `);

      await expect(
        db.execute(sql`
          UPDATE ap_bill_project_allocations
          SET amount = 750
          WHERE id = ${draft.id}
        `),
      ).rejects.toThrow(/ap_bill_project_allocations_immutable|23514|Failed query/i);

      await db.execute(sql`
        UPDATE ap_bill_project_allocations
        SET status = 'superseded'
        WHERE id = ${draft.id}
      `);

      const replacement = resultRows<{ id: string; status: string }>(
        await db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status, supersedes_allocation_id
          )
          VALUES (
            ${orgId}, ${bill.id}, 'project', ${projectA.id},
            'manual_amount', 650, 'ILS', 'applied', ${draft.id}
          )
          RETURNING id, status
        `),
      )[0]!;
      expect(replacement.status).toBe('applied');
    });
  });

  it('H: overlap blocked same employee+project; other project / non-overlap OK', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${orgId}, 'Assign Worker')
          RETURNING id
        `),
      )[0]!;
      const projectA = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${orgId}, 'Assign A')
          RETURNING id
        `),
      )[0]!;
      const projectB = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${orgId}, 'Assign B')
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        INSERT INTO employee_project_assignments (
          organization_id, project_id, employee_id, start_date, end_date, status
        )
        VALUES (${orgId}, ${projectA.id}, ${employee.id}, '2026-01-01', '2026-03-31', 'active')
      `);

      await expect(
        db.execute(sql`
          INSERT INTO employee_project_assignments (
            organization_id, project_id, employee_id, start_date, end_date, status
          )
          VALUES (${orgId}, ${projectA.id}, ${employee.id}, '2026-03-01', '2026-04-30', 'active')
        `),
      ).rejects.toThrow(/employee_project_assignments_overlap|23P01|Failed query/i);

      // Different project overlapping dates - allowed.
      await db.execute(sql`
        INSERT INTO employee_project_assignments (
          organization_id, project_id, employee_id, start_date, end_date, status
        )
        VALUES (${orgId}, ${projectB.id}, ${employee.id}, '2026-02-01', '2026-04-30', 'active')
      `);

      // Non-overlapping repeat on same project - allowed.
      await db.execute(sql`
        INSERT INTO employee_project_assignments (
          organization_id, project_id, employee_id, start_date, end_date, status
        )
        VALUES (${orgId}, ${projectA.id}, ${employee.id}, '2026-04-01', '2026-06-30', 'active')
      `);
    });
  });

  it('I: contact cannot move client/org while projects still point at it', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db);
      const clients = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO clients (organization_id, name)
          VALUES
            (${orgId}, 'Client Keep'),
            (${orgId}, 'Client Move')
          RETURNING id
        `),
      );
      const keep = clients[0]!.id;
      const move = clients[1]!.id;
      const contact = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO client_contacts (organization_id, client_id, name, phone)
          VALUES (${orgId}, ${keep}, 'Pinned Contact', '050')
          RETURNING id
        `),
      )[0]!;
      await db.execute(sql`
        INSERT INTO projects (organization_id, name, client_id, primary_contact_id)
        VALUES (${orgId}, 'Pinned Project', ${keep}, ${contact.id})
      `);

      await expect(
        db.execute(sql`
          UPDATE client_contacts
          SET client_id = ${move}
          WHERE id = ${contact.id}
        `),
      ).rejects.toThrow(/client_contacts_would_invalidate_project_pointer|23514|Failed query/i);
    });
  });
});

describe('PRE-0021 Agent 1 concurrency (two connections via PGlite socket)', () => {
  it('F: two connections cannot over-allocate recognized bill NET', async () => {
    const harness = await openTwoConnectionHarness(applyMigrationsAndAgent1Patch);
    try {
      const { sqlA, sqlB } = harness;

      const org = (
        await sqlA`
          INSERT INTO organizations (name, base_currency)
          VALUES ('Race Vendor Org', 'ILS')
          RETURNING id
        `
      )[0]!;
      const vendor = (
        await sqlA`
          INSERT INTO vendors (organization_id, name)
          VALUES (${org.id}::uuid, 'Race Vendor')
          RETURNING id
        `
      )[0]!;
      const projectA = (
        await sqlA`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}::uuid, 'Race A')
          RETURNING id
        `
      )[0]!;
      const projectB = (
        await sqlA`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}::uuid, 'Race B')
          RETURNING id
        `
      )[0]!;
      const bill = (
        await sqlA`
          INSERT INTO ap_bills (
            organization_id, vendor_id, status, currency, total_amount
          )
          VALUES (${org.id}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100)
          RETURNING id
        `
      )[0]!;

      const insertA = sqlA.begin((tx) => tx`
        INSERT INTO ap_bill_project_allocations (
          organization_id, ap_bill_id, target_type, project_id,
          method, amount, currency, status
        ) VALUES (
          ${org.id}::uuid, ${bill.id}::uuid, 'project', ${projectA.id}::uuid,
          'manual_amount', 80, 'ILS', 'applied'
        )
      `);
      const insertB = sqlB.begin((tx) => tx`
        INSERT INTO ap_bill_project_allocations (
          organization_id, ap_bill_id, target_type, project_id,
          method, amount, currency, status
        ) VALUES (
          ${org.id}::uuid, ${bill.id}::uuid, 'project', ${projectB.id}::uuid,
          'manual_amount', 80, 'ILS', 'applied'
        )
      `);

      const results = await Promise.allSettled([insertA, insertB]);
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      const failReasons = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason);

      expect(okCount).toBeLessThanOrEqual(1);
      for (const reason of failReasons) {
        expect(
          isIntegrityFailure(reason, 'ap_bill_project_allocations_over_bill_net') ||
            isContendedConnectionError(reason),
        ).toBe(true);
      }

      const summary = await sqlA`
        SELECT coalesce(sum(amount), 0)::float8 AS total
        FROM ap_bill_project_allocations
        WHERE ap_bill_id = ${bill.id}::uuid
          AND status IN ('draft', 'applied')
      `;
      expect(Number(summary[0]!.total)).toBeLessThanOrEqual(100);
    } finally {
      await harness.close();
    }
  }, 180_000);

  it('H: two connections cannot insert overlapping same employee+project spans', async () => {
    const harness = await openTwoConnectionHarness(applyMigrationsAndAgent1Patch);
    try {
      const { sqlA, sqlB } = harness;
      const org = (
        await sqlA`
          INSERT INTO organizations (name, base_currency)
          VALUES ('Race Assign Org', 'ILS')
          RETURNING id
        `
      )[0]!;
      const employee = (
        await sqlA`
          INSERT INTO employees (organization_id, name)
          VALUES (${org.id}::uuid, 'Race Assign Worker')
          RETURNING id
        `
      )[0]!;
      const project = (
        await sqlA`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}::uuid, 'Race Assign Project')
          RETURNING id
        `
      )[0]!;

      const insertA = sqlA.begin((tx) => tx`
        INSERT INTO employee_project_assignments (
          organization_id, project_id, employee_id, start_date, end_date, status
        ) VALUES (
          ${org.id}::uuid, ${project.id}::uuid, ${employee.id}::uuid,
          '2026-01-01', '2026-06-30', 'active'
        )
      `);
      const insertB = sqlB.begin((tx) => tx`
        INSERT INTO employee_project_assignments (
          organization_id, project_id, employee_id, start_date, end_date, status
        ) VALUES (
          ${org.id}::uuid, ${project.id}::uuid, ${employee.id}::uuid,
          '2026-03-01', '2026-09-30', 'active'
        )
      `);

      const results = await Promise.allSettled([insertA, insertB]);
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      expect(okCount).toBeLessThanOrEqual(1);

      for (const result of results) {
        if (result.status === 'rejected') {
          expect(
            isIntegrityFailure(result.reason, 'employee_project_assignments_overlap') ||
              isContendedConnectionError(result.reason),
          ).toBe(true);
        }
      }

      const count = await sqlA`
        SELECT count(*)::int AS c
        FROM employee_project_assignments
        WHERE employee_id = ${employee.id}::uuid
          AND project_id = ${project.id}::uuid
          AND status <> 'cancelled'
      `;
      expect(count[0]!.c).toBe(1);
    } finally {
      await harness.close();
    }
  }, 180_000);
});

/**
 * Lead folded Agent 1 integrity into 0021 - assert required objects exist.
 */
describe('PRE-0021 Agent 1 integrity present in 0021', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('ships immutability/currency/vendor/contact guards and calendar year_month', async () => {
    await database.asService(async (db) => {
      const missing = resultRows<{ name: string }>(
        await db.execute(sql`
          SELECT x AS name FROM unnest(ARRAY[
            'employee_month_costs_immutability_guard',
            'labor_allocation_runs_currency_guard',
            'ap_bill_project_allocations_guard',
            'client_contacts_project_pointer_guard'
          ]) AS x
          WHERE NOT EXISTS (
            SELECT 1 FROM pg_trigger t
            WHERE NOT t.tgisinternal AND t.tgname = x
          )
          ORDER BY 1
        `),
      ).map((row) => row.name);

      expect(missing).toEqual([]);

      const yearMonthCheck = resultRows<{ consrc: string }>(
        await db.execute(sql`
          SELECT pg_get_constraintdef(c.oid) AS consrc
          FROM pg_constraint c
          WHERE c.conname = 'employee_month_costs_year_month_shape'
        `),
      )[0]?.consrc ?? '';
      expect(yearMonthCheck.includes('0[1-9]|1[0-2]')).toBe(true);

      const vendorStatus = resultRows<{ column_name: string }>(
        await db.execute(sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ap_bill_project_allocations'
            AND column_name = 'status'
        `),
      );
      expect(vendorStatus).toHaveLength(1);
    });
  });
});
