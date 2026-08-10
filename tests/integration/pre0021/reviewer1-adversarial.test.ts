/**
 * PRE-0021 Reviewer 1 — adversarial financial / concurrency break attempts.
 * Disposable PGlite only. Does not edit migrations or touch owner Supabase.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createTestDatabase,
  resultRows,
  type TestDatabase,
} from '@tests/setup/database';
import {
  applyMigrationsAndAgent1Patch,
  isContendedConnectionError,
  isIntegrityFailure,
  openTwoConnectionHarness,
} from './two-connection';

async function seedOrg(db: TestDatabase['db'], name = 'R1 Org') {
  return resultRows<{ id: string }>(
    await db.execute(sql`
      INSERT INTO organizations (name, base_currency)
      VALUES (${name}, 'ILS')
      RETURNING id
    `),
  )[0]!.id;
}

describe('PRE-0021 Reviewer1 adversarial (SQL invariants)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('1: rejects economic UPDATE/DELETE on applied and closed months', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 Immut');
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${orgId}, 'R1 Worker')
          RETURNING id
        `),
      )[0]!;

      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status
          )
          VALUES (${orgId}, ${employee.id}, '2026-01', 'ILS', 1000, 1000, 'estimated', 'draft')
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        INSERT INTO labor_allocation_runs (
          organization_id, employee_month_cost_id, method, status,
          currency, allocated_amount, unallocated_amount
        )
        VALUES (${orgId}, ${month.id}, 'manual_override', 'applied', 'ILS', 0, 1000)
      `);

      await expect(
        db.execute(sql`
          UPDATE employee_month_costs SET known_amount = 1, estimated_amount = 1
          WHERE id = ${month.id}
        `),
      ).rejects.toThrow(/immutable|23514|Failed query/i);

      await expect(
        db.execute(sql`DELETE FROM employee_month_costs WHERE id = ${month.id}`),
      ).rejects.toThrow(/immutable|23514|Failed query/i);

      // Close via supersede path is required — direct closed money mutate still blocked.
      await db.execute(sql`
        UPDATE employee_month_costs SET status = 'superseded' WHERE id = ${month.id}
      `);
      // After supersede of applied run, month may be draft again; insert closed correction.
      const closed = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status,
            recognition_source, adjusts_month_id
          )
          VALUES (
            ${orgId}, ${employee.id}, '2026-01', 'ILS',
            1000, 1000, 'estimated', 'closed',
            'monthly_allocated', ${month.id}
          )
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          UPDATE employee_month_costs SET known_amount = 50, estimated_amount = 50
          WHERE id = ${closed.id}
        `),
      ).rejects.toThrow(/immutable|23514|Failed query/i);
    });
  });

  it('2: currency mismatch blocked (month/run/lines + vendor≠bill)', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 FX');
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgId}, 'FX') RETURNING id
        `),
      )[0]!;
      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name) VALUES (${orgId}, 'FX P') RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality
          )
          VALUES (${orgId}, ${employee.id}, '2026-02', 'ILS', 100, 100, 'estimated')
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          ) VALUES (${orgId}, ${month.id}, 'manual_override', 'draft', 'EUR', 0, 100)
        `),
      ).rejects.toThrow(/currency_mismatch|23514|Failed query/i);

      const run = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          ) VALUES (${orgId}, ${month.id}, 'manual_override', 'draft', 'ILS', 50, 50)
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_run_lines (
            organization_id, labor_allocation_run_id, project_id, amount, currency
          ) VALUES (${orgId}, ${run.id}, ${project.id}, 50, 'EUR')
        `),
      ).rejects.toThrow(/currency_mismatch|23514|Failed query/i);

      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}, 'V') RETURNING id
        `),
      )[0]!;
      const bill = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, status, currency, total_amount)
          VALUES (${orgId}, ${vendor.id}, 'open', 'ILS', 200)
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          ) VALUES (
            ${orgId}, ${bill.id}, 'project', ${project.id},
            'manual_amount', 10, 'USD', 'draft'
          )
        `),
      ).rejects.toThrow(/currency_mismatch|23514|Failed query/i);
    });
  });

  it('3: labor conservation — header/lines must match known; over-alloc fails', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 Cons');
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgId}, 'C') RETURNING id
        `),
      )[0]!;
      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name) VALUES (${orgId}, 'P') RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality
          )
          VALUES (${orgId}, ${employee.id}, '2026-03', 'ILS', 1000, 1000, 'estimated')
          RETURNING id
        `),
      )[0]!;
      const run = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          ) VALUES (${orgId}, ${month.id}, 'fixed_amount', 'draft', 'ILS', 0, 1000)
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        INSERT INTO labor_allocation_run_lines (
          organization_id, labor_allocation_run_id, project_id, amount, currency
        ) VALUES (${orgId}, ${run.id}, ${project.id}, 700, 'ILS')
      `);

      // Header claims more allocated than lines.
      await expect(
        db.execute(sql`
          UPDATE labor_allocation_runs
          SET status = 'applied', allocated_amount = 800, unallocated_amount = 200
          WHERE id = ${run.id}
        `),
      ).rejects.toThrow(/lines_mismatch|conservation_failed|23514|Failed query/i);

      // Header + unallocated ≠ known.
      await expect(
        db.execute(sql`
          UPDATE labor_allocation_runs
          SET status = 'applied', allocated_amount = 700, unallocated_amount = 200
          WHERE id = ${run.id}
        `),
      ).rejects.toThrow(/conservation_failed|23514|Failed query/i);

      await db.execute(sql`
        UPDATE labor_allocation_runs
        SET status = 'applied', allocated_amount = 700, unallocated_amount = 300
        WHERE id = ${run.id}
      `);
    });
  });

  it('4: vendor active SUM cannot exceed bill NET (payment ignored; overhead counts)', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 Vendor');
      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name) VALUES (${orgId}, 'VP') RETURNING id
        `),
      )[0]!;
      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}, 'VV') RETURNING id
        `),
      )[0]!;
      const bill = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, status, currency, total_amount)
          VALUES (${orgId}, ${vendor.id}, 'open', 'ILS', 100)
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        INSERT INTO ap_bill_project_allocations (
          organization_id, ap_bill_id, target_type, project_id,
          method, amount, currency, status
        ) VALUES (
          ${orgId}, ${bill.id}, 'project', ${project.id},
          'manual_amount', 60, 'ILS', 'draft'
        )
      `);

      await expect(
        db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          ) VALUES (
            ${orgId}, ${bill.id}, 'overhead', NULL,
            'manual_amount', 50, 'ILS', 'draft'
          )
        `),
      ).rejects.toThrow(/over_bill_net|23514|Failed query/i);

      const payment = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_payments (
            organization_id, vendor_id, amount, currency, payment_date, status
          ) VALUES (${orgId}, ${vendor.id}, 9999, 'ILS', '2026-08-01', 'recorded')
          RETURNING id
        `),
      )[0]!;
      await db.execute(sql`
        INSERT INTO ap_payment_applications (
          organization_id, ap_payment_id, ap_bill_id, applied_amount, currency
        ) VALUES (${orgId}, ${payment.id}, ${bill.id}, 100, 'ILS')
      `);

      await expect(
        db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          ) VALUES (
            ${orgId}, ${bill.id}, 'overhead', NULL,
            'manual_amount', 50, 'ILS', 'applied'
          )
        `),
      ).rejects.toThrow(/over_bill_net|23514|Failed query/i);
    });
  });

  it('7: displacement coupling — applied/closed cannot stay on time_snapshot', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 Disp');
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgId}, 'D') RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status, recognition_source
          ) VALUES (
            ${orgId}, ${employee.id}, '2026-04', 'ILS',
            100, 100, 'estimated', 'applied', 'time_snapshot'
          )
        `),
      ).rejects.toThrow(/displacement_coupling|23514|Failed query/i);

      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status
          ) VALUES (${orgId}, ${employee.id}, '2026-04', 'ILS', 100, 100, 'estimated', 'draft')
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        INSERT INTO labor_allocation_runs (
          organization_id, employee_month_cost_id, method, status,
          currency, allocated_amount, unallocated_amount
        ) VALUES (${orgId}, ${month.id}, 'manual_override', 'applied', 'ILS', 0, 100)
      `);

      const after = resultRows<{ status: string; recognition_source: string }>(
        await db.execute(sql`
          SELECT status, recognition_source FROM employee_month_costs WHERE id = ${month.id}
        `),
      )[0]!;
      expect(after.status).toBe('applied');
      expect(after.recognition_source).toBe('monthly_allocated');

      // Direct flip back to time_snapshot while applied must fail.
      await expect(
        db.execute(sql`
          UPDATE employee_month_costs
          SET recognition_source = 'time_snapshot'
          WHERE id = ${month.id}
        `),
      ).rejects.toThrow(/immutable|displacement|23514|Failed query/i);
    });
  });

  it('7b BLOCK probe: superseding applied run on closed month', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 ClosedSup');
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgId}, 'CS') RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality, status
          ) VALUES (${orgId}, ${employee.id}, '2026-05', 'ILS', 200, 200, 'estimated', 'draft')
          RETURNING id
        `),
      )[0]!;
      const run = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          ) VALUES (${orgId}, ${month.id}, 'manual_override', 'applied', 'ILS', 0, 200)
          RETURNING id
        `),
      )[0]!;

      // Mark month closed (allowed transition applied→closed? immutability: status change
      // from applied only allows superseded. So close may need to be set another way.)
      // Probe: can we UPDATE status applied→closed?
      let closedOk = false;
      try {
        await db.execute(sql`
          UPDATE employee_month_costs SET status = 'closed' WHERE id = ${month.id}
        `);
        closedOk = true;
      } catch {
        closedOk = false;
      }

      if (!closedOk) {
        // Documented gap: applied→closed blocked by immutability transition list.
        expect(closedOk).toBe(false);
        return;
      }

      // If close succeeded, superseding the run must not leave closed+time_snapshot.
      let supersedeError: unknown;
      try {
        await db.execute(sql`
          UPDATE labor_allocation_runs SET status = 'superseded' WHERE id = ${run.id}
        `);
      } catch (error) {
        supersedeError = error;
      }

      const row = resultRows<{ status: string; recognition_source: string }>(
        await db.execute(sql`
          SELECT status, recognition_source FROM employee_month_costs WHERE id = ${month.id}
        `),
      )[0]!;

      if (supersedeError) {
        // Acceptable: reject supersede rather than corrupt coupling.
        expect(String(supersedeError)).toMatch(/23514|displacement|Failed query/i);
        expect(row.recognition_source).toBe('monthly_allocated');
      } else {
        // Must NOT leave closed + time_snapshot (double-count hole).
        expect(
          !(row.status === 'closed' && row.recognition_source === 'time_snapshot'),
        ).toBe(true);
      }
    });
  });

  it('8: retroactive rewrite blocked on applied runs/lines and vendor applied', async () => {
    await database.asService(async (db) => {
      const orgId = await seedOrg(db, 'R1 Retro');
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgId}, 'R') RETURNING id
        `),
      )[0]!;
      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name) VALUES (${orgId}, 'RP') RETURNING id
        `),
      )[0]!;
      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency,
            estimated_amount, known_amount, known_quality
          ) VALUES (${orgId}, ${employee.id}, '2026-06', 'ILS', 500, 500, 'estimated')
          RETURNING id
        `),
      )[0]!;
      const run = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          ) VALUES (${orgId}, ${month.id}, 'fixed_amount', 'draft', 'ILS', 0, 500)
          RETURNING id
        `),
      )[0]!;
      const line = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_run_lines (
            organization_id, labor_allocation_run_id, project_id, amount, currency
          ) VALUES (${orgId}, ${run.id}, ${project.id}, 300, 'ILS')
          RETURNING id
        `),
      )[0]!;
      await db.execute(sql`
        UPDATE labor_allocation_runs
        SET status = 'applied', allocated_amount = 300, unallocated_amount = 200
        WHERE id = ${run.id}
      `);

      await expect(
        db.execute(sql`
          UPDATE labor_allocation_run_lines SET amount = 1 WHERE id = ${line.id}
        `),
      ).rejects.toThrow(/immutable|23514|Failed query/i);

      await expect(
        db.execute(sql`
          UPDATE labor_allocation_runs SET allocated_amount = 1 WHERE id = ${run.id}
        `),
      ).rejects.toThrow(/immutable|23514|Failed query/i);

      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}, 'RV') RETURNING id
        `),
      )[0]!;
      const bill = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, status, currency, total_amount)
          VALUES (${orgId}, ${vendor.id}, 'open', 'ILS', 80)
          RETURNING id
        `),
      )[0]!;
      const alloc = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          ) VALUES (
            ${orgId}, ${bill.id}, 'project', ${project.id},
            'manual_amount', 40, 'ILS', 'applied'
          )
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          UPDATE ap_bill_project_allocations SET amount = 10 WHERE id = ${alloc.id}
        `),
      ).rejects.toThrow(/immutable|23514|Failed query/i);
    });
  });

  it('9: tenant mismatch — composite org FKs reject cross-org pointers', async () => {
    await database.asService(async (db) => {
      const orgA = await seedOrg(db, 'R1 OrgA');
      const orgB = await seedOrg(db, 'R1 OrgB');
      const empA = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgA}, 'EA') RETURNING id
        `),
      )[0]!;
      const empB = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name) VALUES (${orgB}, 'EB') RETURNING id
        `),
      )[0]!;
      const projA = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name) VALUES (${orgA}, 'PA') RETURNING id
        `),
      )[0]!;
      const vendorA = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgA}, 'VA') RETURNING id
        `),
      )[0]!;
      const billA = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, status, currency, total_amount)
          VALUES (${orgA}, ${vendorA.id}, 'open', 'ILS', 50)
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency, known_amount
          ) VALUES (${orgA}, ${empB.id}, '2026-07', 'ILS', 10)
        `),
      ).rejects.toThrow(/foreign key|23503|Failed query/i);

      await expect(
        db.execute(sql`
          INSERT INTO employee_project_assignments (
            organization_id, project_id, employee_id, start_date, status
          ) VALUES (${orgA}, ${projA.id}, ${empB.id}, '2026-01-01', 'active')
        `),
      ).rejects.toThrow(/foreign key|23503|Failed query/i);

      await expect(
        db.execute(sql`
          INSERT INTO ap_bill_project_allocations (
            organization_id, ap_bill_id, target_type, project_id,
            method, amount, currency, status
          ) VALUES (
            ${orgB}, ${billA.id}, 'project', ${projA.id},
            'manual_amount', 10, 'ILS', 'draft'
          )
        `),
      ).rejects.toThrow(/foreign key|23503|Failed query/i);

      // Sanity: same-org path works.
      await db.execute(sql`
        INSERT INTO employee_month_costs (
          organization_id, employee_id, year_month, currency,
          estimated_amount, known_amount, known_quality
        ) VALUES (${orgA}, ${empA.id}, '2026-07', 'ILS', 10, 10, 'estimated')
      `);
    });
  });
});

describe('PRE-0021 Reviewer1 concurrency re-break', () => {
  it('5: concurrent vendor allocations cannot exceed NET', async () => {
    const harness = await openTwoConnectionHarness(applyMigrationsAndAgent1Patch);
    try {
      const { sqlA, sqlB } = harness;
      const org = (
        await sqlA`
          INSERT INTO organizations (name, base_currency)
          VALUES ('R1 Race Vendor', 'ILS') RETURNING id
        `
      )[0]!;
      const vendor = (
        await sqlA`
          INSERT INTO vendors (organization_id, name)
          VALUES (${org.id}::uuid, 'RV') RETURNING id
        `
      )[0]!;
      const p1 = (
        await sqlA`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}::uuid, 'P1') RETURNING id
        `
      )[0]!;
      const p2 = (
        await sqlA`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}::uuid, 'P2') RETURNING id
        `
      )[0]!;
      const bill = (
        await sqlA`
          INSERT INTO ap_bills (organization_id, vendor_id, status, currency, total_amount)
          VALUES (${org.id}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100)
          RETURNING id
        `
      )[0]!;

      const results = await Promise.allSettled([
        sqlA.begin(
          (tx) => tx`
            INSERT INTO ap_bill_project_allocations (
              organization_id, ap_bill_id, target_type, project_id,
              method, amount, currency, status
            ) VALUES (
              ${org.id}::uuid, ${bill.id}::uuid, 'project', ${p1.id}::uuid,
              'manual_amount', 70, 'ILS', 'applied'
            )
          `,
        ),
        sqlB.begin(
          (tx) => tx`
            INSERT INTO ap_bill_project_allocations (
              organization_id, ap_bill_id, target_type, project_id,
              method, amount, currency, status
            ) VALUES (
              ${org.id}::uuid, ${bill.id}::uuid, 'project', ${p2.id}::uuid,
              'manual_amount', 70, 'ILS', 'applied'
            )
          `,
        ),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(
            isIntegrityFailure(r.reason, 'ap_bill_project_allocations_over_bill_net') ||
              isContendedConnectionError(r.reason),
          ).toBe(true);
        }
      }

      const sum = await sqlA`
        SELECT coalesce(sum(amount), 0)::float8 AS total
        FROM ap_bill_project_allocations
        WHERE ap_bill_id = ${bill.id}::uuid AND status IN ('draft', 'applied')
      `;
      expect(Number(sum[0]!.total)).toBeLessThanOrEqual(100);
    } finally {
      await harness.close();
    }
  }, 180_000);

  it('6: concurrent overlapping assignments — at most one wins', async () => {
    const harness = await openTwoConnectionHarness(applyMigrationsAndAgent1Patch);
    try {
      const { sqlA, sqlB } = harness;
      const org = (
        await sqlA`
          INSERT INTO organizations (name, base_currency)
          VALUES ('R1 Race Assign', 'ILS') RETURNING id
        `
      )[0]!;
      const employee = (
        await sqlA`
          INSERT INTO employees (organization_id, name)
          VALUES (${org.id}::uuid, 'RA') RETURNING id
        `
      )[0]!;
      const project = (
        await sqlA`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}::uuid, 'RAP') RETURNING id
        `
      )[0]!;

      const results = await Promise.allSettled([
        sqlA.begin(
          (tx) => tx`
            INSERT INTO employee_project_assignments (
              organization_id, project_id, employee_id, start_date, end_date, status
            ) VALUES (
              ${org.id}::uuid, ${project.id}::uuid, ${employee.id}::uuid,
              '2026-01-01', '2026-06-30', 'active'
            )
          `,
        ),
        sqlB.begin(
          (tx) => tx`
            INSERT INTO employee_project_assignments (
              organization_id, project_id, employee_id, start_date, end_date, status
            ) VALUES (
              ${org.id}::uuid, ${project.id}::uuid, ${employee.id}::uuid,
              '2026-04-01', '2026-12-31', 'active'
            )
          `,
        ),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);

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
