/**
 * Migration 0070 FINAL architecture closure — adversarial / upgrade matrix.
 * Does NOT apply to production. PGlite only.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  applySqlMigrations,
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { createOrganization } from '@/modules/tenancy';
import {
  assertCostCategoryFamilyConsistent,
  hasReliableSubcontractorSignal,
  resolveExpenseClassificationStatus,
  resolveTransactionClassificationStatus,
  resolveOwnerBreakdownBucket,
} from '@/modules/financials/domain/economic-classification';
import { localizeVendorCategoryName } from '@/modules/business-catalog/domain/vendor-capability-labels';
import {
  assertInternalPayrollExpenseAllowed,
  shouldExcludeLaborExpenseForWorkforce,
} from '@/modules/financials/domain/labor-expense-integrity';
import { composeCompanyActual } from '@/modules/financials/domain/company-actual';
import { resolveExpenseTargeting } from '@/modules/expenses/domain/targeting';
import { money, toNumericString } from '@/shared/money';
import { recognizeMonthlyEmployerPoolByCalendar } from '@/modules/workforce/domain/monthly-accrual';
import { createApBill } from '@/modules/ap';
import { resolveOrgContext } from '@/modules/tenancy';
import { loadRecognizedVendorBillAtomsForProject } from '@/modules/financials/data/recognized-vendor-bill-atoms.repository';
import { createProject } from '@/modules/projects';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG_0069 = '0069_true_cost_profitability';
const TAG_0070 = '0070_financial_classification_architecture';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string; code?: string };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function expectFailure(run: () => Promise<unknown>, token: string | RegExp) {
  let message = '';
  try {
    await run();
  } catch (error) {
    message = errorBlob(error);
  }
  if (token instanceof RegExp) {
    expect(message, `expected failure matching ${token}`).toMatch(token);
    return;
  }
  expect(message, `expected failure containing ${token}`).toContain(token);
}

async function applyNamed(client: { exec: (sqlText: string) => Promise<unknown> }, tag: string) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

describe('0070 FINAL architecture closure', () => {
  it('SQL: additive only; catalog reuse; classification invariants; taxonomy seeds', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0070}.sql`), 'utf8');
    expect(raw).not.toMatch(/DROP\s+TABLE/i);
    expect(raw).not.toMatch(/DROP\s+TABLE[\s\S]*CASCADE/i);
    expect(raw).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.vendor_roles/i);
    expect(raw).toContain('vendor_catalog_links');
    expect(raw).toContain("kind = 'vendor_category'");
    expect(raw).toContain("DEFAULT 'needs_classification'");
    expect(raw).toContain('assert_transaction_classification_status');
    expect(raw).toContain('assert_expense_recognition_gate');
    expect(raw).toContain('assert_ap_bill_recognition_gate');
    expect(raw).toContain('assert_ap_bill_line_immutability_guard');
    expect(raw).toContain('is_ap_bill_recognized_status');
    expect(raw).toContain('validate_ap_bill_recognition_atoms');
    expect(raw).toContain('ap_bill_lines_bill_org_fk');
    expect(raw).toContain('ap_bill_lines_net_tax_gross');
    expect(raw).toContain('cost_categories_semantic_guard');
    expect(raw).toContain('remediate_expense_classification');
    expect(raw).toContain('void AP bills are terminal');
    expect(raw).toContain('trusted_financial_latch_acquire');
    expect(raw).toContain('remediate_ap_bill_line_classification');
    expect(raw).toContain('ap_bill_lines_classification_status_known');
    expect(raw).not.toContain('ap_bills_classification_status_known');
    expect(raw).toContain('external_service');
    expect(raw).toContain('external_manpower');
    expect(raw).toContain('internal_employee_payroll is not allowed');
    expect(raw).not.toMatch(/\('internal_employee_payroll',\s*'Internal employee payroll/);
    expect(raw).toContain('ap_bills_cost_category_org_fk');
    expect(raw).toContain('ON DELETE SET NULL (cost_category_id)');
    expect(raw).toContain('name_he');
  });

  it('clean upgrade 0069 → 0070: safe backfill + catalog capability + no vendor_roles', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, TAG_0069);

      const orgId = randomUUID();
      const userId = randomUUID();
      await client.exec(`
        INSERT INTO profiles (id, email, display_name)
        VALUES ('${userId}', 'u0070f@example.test', 'U0070F');
        INSERT INTO organizations (id, name, country_code, base_currency, timezone, default_locale)
        VALUES ('${orgId}', 'Org 0070F', 'IL', 'ILS', 'Asia/Jerusalem', 'he-IL');
      `);

      const catSub = randomUUID();
      const catLabor = randomUUID();
      await client.exec(`
        INSERT INTO cost_categories (id, organization_id, key, name, family, is_system, sort_order)
        VALUES
          ('${catSub}', '${orgId}', 'subcontractor', 'Sub', 'direct_project', true, 1),
          ('${catLabor}', '${orgId}', 'labor', 'Labor', 'direct_project', true, 2);
      `);

      const vSub = randomUUID();
      const vSup = randomUUID();
      await client.exec(`
        INSERT INTO vendors (id, organization_id, name, type)
        VALUES
          ('${vSub}', '${orgId}', 'התותחים', 'subcontractor'),
          ('${vSup}', '${orgId}', 'דלק', 'supplier');
      `);

      const expClassified = randomUUID();
      const expLabor = randomUUID();
      const expNull = randomUUID();
      await client.exec(`
        INSERT INTO expenses (
          id, organization_id, expense_date, description, vendor_id,
          cost_family, cost_category_id, net_amount, tax_amount, gross_amount, currency, status
        ) VALUES
          ('${expClassified}', '${orgId}', '2026-01-01', 'עובדים', '${vSub}',
           'direct_project', '${catSub}', 1000, 0, 1000, 'ILS', 'finalized'),
          ('${expLabor}', '${orgId}', '2026-03-01', 'גילוי אש', NULL,
           'direct_project', '${catLabor}', 2000, 0, 2000, 'ILS', 'finalized'),
          ('${expNull}', '${orgId}', '2026-02-01', 'misc', '${vSup}',
           'business_overhead', NULL, 3000, 0, 3000, 'ILS', 'finalized');
      `);

      const sumBefore = await client.query<{ s: string }>(
        `SELECT COALESCE(SUM(net_amount),0)::text AS s FROM expenses WHERE organization_id='${orgId}'`,
      );

      await applyNamed(client, TAG_0070);

      const sumAfter = await client.query<{ s: string }>(
        `SELECT COALESCE(SUM(net_amount),0)::text AS s FROM expenses WHERE organization_id='${orgId}'`,
      );
      expect(sumAfter.rows[0]!.s).toBe(sumBefore.rows[0]!.s);

      const statuses = await client.query<{ id: string; classification_status: string }>(
        `SELECT id, classification_status FROM expenses WHERE organization_id='${orgId}'`,
      );
      const byId = Object.fromEntries(statuses.rows.map((r) => [r.id, r.classification_status]));
      expect(byId[expClassified]).toBe('classified');
      expect(byId[expLabor]).toBe('needs_classification');
      expect(byId[expNull]).toBe('needs_classification');

      await client.exec(`
        UPDATE expenses SET description = 'historical preserved'
        WHERE id = '${expNull}';
      `);

      const rolesTable = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name='vendor_roles'`,
      );
      expect(rolesTable.rows).toHaveLength(0);

      const links = await client.query<{ key: string }>(
        `SELECT e.key FROM vendor_catalog_links l
         JOIN organization_catalog_entries e ON e.id = l.catalog_entry_id
         WHERE l.vendor_id='${vSub}'`,
      );
      expect(links.rows.map((r) => r.key)).toContain('subcontractor');

      const supplierLinks = await client.query(
        `SELECT 1 FROM vendor_catalog_links WHERE vendor_id='${vSup}'`,
      );
      expect(supplierLinks.rows).toHaveLength(0);

      const ext = await client.query(
        `SELECT 1 FROM cost_categories WHERE organization_id='${orgId}' AND key='external_service'`,
      );
      expect(ext.rows).toHaveLength(1);

      const heName = await client.query<{ name: string }>(
        `SELECT name FROM organization_catalog_entries
         WHERE organization_id='${orgId}' AND kind='vendor_category' AND key='subcontractor'`,
      );
      expect(heName.rows[0]?.name).toBe('קבלן משנה');
    });
  });
});

describe('0070 adversarial DB + mixed AP (TestDatabase)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('classification_status DB invariants deny bad classified writes', async () => {
    const owner = await createTestUser(database, 'cls-inv@example.test');
    const orgId = await database.asService(async (db) => {
      const created = await createOrganization(db, owner.id, {
        name: 'Cls Inv',
        countryCode: 'IL',
      });
      return created.organization.id;
    });

    const laborId = await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO cost_categories (organization_id, key, name, family, is_system, sort_order)
        VALUES (${orgId}::uuid, 'labor', 'Labor legacy', 'direct_project', true, 30)
        ON CONFLICT (organization_id, key) DO NOTHING
      `);
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM cost_categories WHERE organization_id=${orgId}::uuid AND key='labor' LIMIT 1
        `),
      );
      return rows[0]!.id;
    });

    const materialsId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id=${orgId}::uuid AND key='materials' LIMIT 1
        `),
      );
      return rows[0]!.id;
    });

    // 1. classified + NULL category
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'direct_project', NULL,
              10, 0, 10, 'ILS', 'draft', 'classified'
            )
          `);
        }),
      /requires cost_category_id|23514/i,
    );

    // 2. classified + legacy labor
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'direct_project', ${laborId}::uuid,
              10, 0, 10, 'ILS', 'draft', 'classified'
            )
          `);
        }),
      /not allowed for category key labor|23514/i,
    );

    // 3. classified + internal payroll (insert category then deny use)
    const payrollId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO cost_categories (organization_id, key, name, family, is_system, sort_order)
          VALUES (${orgId}::uuid, 'internal_employee_payroll', 'Payroll', 'direct_project', true, 35)
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'direct_project', ${payrollId}::uuid,
              10, 0, 10, 'ILS', 'draft', 'needs_classification'
            )
          `);
        }),
      /not allowed on ordinary Expense|23514/i,
    );

    // 4. wrong-org category
    const ownerB = await createTestUser(database, 'cls-inv-b@example.test');
    const orgB = await database.asService(async (db) => {
      const created = await createOrganization(db, ownerB.id, {
        name: 'Cls Inv B',
        countryCode: 'IL',
      });
      return created.organization.id;
    });
    const matB = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM cost_categories WHERE organization_id=${orgB}::uuid AND key='materials' LIMIT 1
        `),
      );
      return rows[0]!.id;
    });
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'direct_project', ${matB}::uuid,
              10, 0, 10, 'ILS', 'draft', 'classified'
            )
          `);
        }),
      /not found in organization|23503/i,
    );

    // 5. family mismatch
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'business_overhead', ${materialsId}::uuid,
              10, 0, 10, 'ILS', 'draft', 'classified'
            )
          `);
        }),
      /contradicts category family|23514/i,
    );

    // 6. draft needs_classification remains insertable; finalize transition denied
    const draftUnclassifiedId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO expenses (
            organization_id, expense_date, cost_family, cost_category_id,
            net_amount, tax_amount, gross_amount, currency, status, classification_status
          ) VALUES (
            ${orgId}::uuid, '2026-01-01', 'direct_project', NULL,
            99, 0, 99, 'ILS', 'draft', 'needs_classification'
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE expenses
            SET status = 'finalized', classification_status = 'needs_classification'
            WHERE id = ${draftUnclassifiedId}::uuid
          `);
        }),
      /requires classified transaction category|23514/i,
    );

    // 7. inventory_stock_purchase cannot be classified without cost_category_id
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status,
              inventory_stock_purchase
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'direct_project', NULL,
              10, 0, 10, 'ILS', 'draft', 'classified', true
            )
          `);
        }),
      /requires cost_category_id|23514/i,
    );

    // 8. asset_capital family cannot be classified without cost_category_id
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'asset_capital', NULL,
              10, 0, 10, 'ILS', 'draft', 'classified'
            )
          `);
        }),
      /requires cost_category_id|23514/i,
    );

    // 9. AP line classified without category denied
    const vendorId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name, type)
          VALUES (${orgId}::uuid, 'AP cls', 'supplier')
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });
    const billId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
          ) VALUES (
            ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 100, 100, 0, 100, 'draft'
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO ap_bill_lines (
              organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
              net_amount, tax_amount, gross_amount, currency,
              classification_status, cost_category_id
            ) VALUES (
              ${orgId}::uuid, ${billId}::uuid, 'line', 1, 100, 100,
              100, 0, 100, 'ILS', 'classified', NULL
            )
          `);
        }),
      /requires cost_category_id|23514/i,
    );

    // 10. AP needs_classification line on draft OK; recognition denied
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ap_bill_lines (
          organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
          net_amount, tax_amount, gross_amount, currency,
          classification_status, cost_category_id
        ) VALUES (
          ${orgId}::uuid, ${billId}::uuid, 'unclassified', 1, 50, 50,
          50, 0, 50, 'ILS', 'needs_classification', NULL
        )
      `);
    });
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE ap_bills SET status = 'open' WHERE id = ${billId}::uuid
          `);
        }),
      /cannot be recognized until every line|23514/i,
    );

    // 11. direct insert as open AP bill denied
    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
            ) VALUES (
              ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 100, 100, 0, 100, 'open'
            )
          `);
        }),
      /must be created as draft|23514/i,
    );
    expect(
      resolveOwnerBreakdownBucket({
        classificationStatus: 'needs_classification',
        categoryKey: null,
        vendorType: 'subcontractor',
        vendorRoleKeys: ['subcontractor'],
      }),
    ).toBe('otherExpenses');
  });

  it('vendor capability never classifies null-category transaction', () => {
    expect(
      hasReliableSubcontractorSignal({
        categoryKey: null,
        subcontractAgreementId: null,
      }),
    ).toBe(false);

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: null,
        vendorType: 'subcontractor',
        vendorRoleKeys: ['subcontractor'],
        vendorId: 'v1',
        classificationStatus: 'needs_classification',
      }),
    ).toBe('otherExpenses');

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: 'subcontractor',
        classificationStatus: 'classified',
      }),
    ).toBe('subcontractors');
  });

  it('mixed AP end-to-end: 10k materials + 2k rental + 3k service', async () => {
    const owner = await createTestUser(database, 'mixed-ap@example.test');
    const orgCreated = await database.asUser(owner.id, async (tx) =>
      createOrganization(tx, owner.id, { name: 'Mixed AP', countryCode: 'IL' }),
    );
    const organizationId = orgCreated.organization.id;

    const { billId, projectId } = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId,
        locale: 'en',
      });
      const project = await createProject(context, { name: 'Mixed Project' });
      const vendorRows = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name, type)
          VALUES (${organizationId}::uuid, 'Multi Cap Vendor', 'subcontractor')
          RETURNING id
        `),
      );
      const vendorId = vendorRows[0]!.id;
      const categoryRows = resultRows<{ id: string; key: string }>(
        await tx.execute(sql`
          SELECT id, key FROM cost_categories
          WHERE organization_id=${organizationId}::uuid
            AND key IN ('materials','equipment_rental','external_service')
        `),
      );
      const categoryMap = Object.fromEntries(categoryRows.map((r) => [r.key, r.id])) as Record<
        string,
        string
      >;
      const bill = await createApBill(context, {
        vendorId,
        projectId: project.projectId,
        currency: 'ILS',
        totalAmount: '15000',
        amountIncludesTax: false,
        lines: [
          {
            description: 'Materials',
            quantity: '1',
            unitAmount: '10000',
            lineTotal: '10000',
            currency: 'ILS',
            costCategoryId: categoryMap.materials,
            costFamily: 'direct_project',
          },
          {
            description: 'Equipment rental',
            quantity: '1',
            unitAmount: '2000',
            lineTotal: '2000',
            currency: 'ILS',
            costCategoryId: categoryMap.equipment_rental,
            costFamily: 'direct_project',
          },
          {
            description: 'External service',
            quantity: '1',
            unitAmount: '3000',
            lineTotal: '3000',
            currency: 'ILS',
            costCategoryId: categoryMap.external_service,
            costFamily: 'direct_project',
          },
        ],
      });
      return { billId: bill.id, projectId: project.projectId };
    });

    const reloaded = await database.asService(async (db) =>
      resultRows<{ key: string | null; line_total: string; classification_status: string }>(
        await db.execute(sql`
          SELECT c.key, l.line_total::text, l.classification_status
          FROM ap_bill_lines l
          LEFT JOIN cost_categories c ON c.id = l.cost_category_id AND c.organization_id = l.organization_id
          WHERE l.ap_bill_id = ${billId}::uuid
          ORDER BY l.sort_order
        `),
      ),
    );
    expect(reloaded.map((r) => r.key)).toEqual([
      'materials',
      'equipment_rental',
      'external_service',
    ]);
    expect(reloaded.every((r) => r.classification_status === 'classified')).toBe(true);

    const atoms = await database.asService(async (db) =>
      loadRecognizedVendorBillAtomsForProject(db, organizationId, projectId, 'ILS'),
    );
    const byKey = new Map<string, number>();
    let total = 0;
    for (const atom of atoms) {
      const key = atom.categoryKey ?? 'null';
      const n = Number(toNumericString(atom.amount));
      byKey.set(key, (byKey.get(key) ?? 0) + n);
      total += n;
    }
    expect(total).toBeCloseTo(15000, 5);
    expect(byKey.get('materials')).toBeCloseTo(10000, 5);
    expect(byKey.get('equipment_rental')).toBeCloseTo(2000, 5);
    expect(byKey.get('external_service')).toBeCloseTo(3000, 5);

    expect(resolveOwnerBreakdownBucket({
      categoryKey: 'materials',
      classificationStatus: 'classified',
      vendorId: 'v-mixed',
    })).toBe('materials');
    expect(resolveOwnerBreakdownBucket({
      categoryKey: 'equipment_rental',
      classificationStatus: 'classified',
      vendorId: 'v-mixed',
    })).toBe('vendors');
    expect(resolveOwnerBreakdownBucket({
      categoryKey: 'external_service',
      classificationStatus: 'classified',
      vendorId: 'v-mixed',
    })).toBe('vendors');

    const composed = composeCompanyActual({
      currency: 'ILS',
      directProjectActual: money('15000', 'ILS'),
      generalPool: money('0', 'ILS'),
      allocatedGeneralToProjects: money('0', 'ILS'),
      unallocatableGeneral: money('0', 'ILS'),
    });
    expect(composed.reconciles).toBe(true);
    expect(composed.companyActual).toEqual(money('15000', 'ILS'));
  });

  it('domain payroll ban + calendar labor still pass', () => {
    expect(() =>
      assertInternalPayrollExpenseAllowed({ categoryKey: 'internal_employee_payroll' }),
    ).toThrow(/not allowed/i);
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'internal_employee_payroll',
        projectId: 'p1',
        hasWorkforceData: false,
      }),
    ).toBe(true);
    expect(resolveExpenseClassificationStatus({ costCategoryId: null })).toBe(
      'needs_classification',
    );
    expect(
      resolveTransactionClassificationStatus({
        costCategoryId: null,
        categoryKey: 'materials',
      }),
    ).toBe('needs_classification');
    expect(
      resolveExpenseClassificationStatus({
        costCategoryId: null,
        inventoryStockPurchase: true,
        costFamily: 'asset_capital',
      }),
    ).toBe('needs_classification');
    expect(localizeVendorCategoryName('subcontractor', 'Subcontractor', 'he-IL', true)).toBe(
      'קבלן משנה',
    );
    expect(() =>
      assertCostCategoryFamilyConsistent({
        costCategoryId: 'x',
        costFamily: 'business_overhead',
        categoryFamily: 'direct_project',
      }),
    ).toThrow(/contradicts/i);

    const labor = recognizeMonthlyEmployerPoolByCalendar({
      fullMonthlyEmployerCost: money('22000', 'ILS'),
      totalEligibleWorkdaysInMonth: 22,
      accruedWorkDayCount: 10,
      recognizeFullMonth: false,
      fallbackWorkingDaysPerMonth: null,
    });
    expect(labor!.recognizedPool).toEqual(money('10000', 'ILS'));
  });

  it('AP recognition lifecycle + line immutability + reversal + remediation', async () => {
    const owner = await createTestUser(database, 'ap-life@example.test');
    const orgId = await database.asService(async (db) => {
      const created = await createOrganization(db, owner.id, {
        name: 'AP Life',
        countryCode: 'IL',
      });
      return created.organization.id;
    });

    const materialsId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id=${orgId}::uuid AND key='materials' LIMIT 1
        `),
      );
      return rows[0]!.id;
    });

    const vendorId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name, type)
          VALUES (${orgId}::uuid, 'Life Vendor', 'supplier')
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    const billId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
          ) VALUES (
            ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 15000, 15000, 0, 15000, 'draft'
          )
          RETURNING id
        `),
      );
      const id = rows[0]!.id;
      await db.execute(sql`
        INSERT INTO ap_bill_lines (
          organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
          net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id
        ) VALUES (
          ${orgId}::uuid, ${id}::uuid, 'Materials', 1, 15000, 15000,
          15000, 0, 15000, 'ILS', 'classified', ${materialsId}::uuid
        )
      `);
      return id;
    });

    await database.asService(async (db) => {
      await db.execute(sql`UPDATE ap_bills SET status = 'open' WHERE id = ${billId}::uuid`);
    });

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE ap_bill_lines SET net_amount = 14000 WHERE ap_bill_id = ${billId}::uuid
          `);
        }),
      /immutable|23514/i,
    );

    await database.asService(async (db) => {
      await db.execute(sql`SELECT app.next_gen_latch_acquire('ap_bill_void')`);
      try {
        await db.execute(sql`UPDATE ap_bills SET status = 'void' WHERE id = ${billId}::uuid`);
      } finally {
        await db.execute(sql`SELECT app.next_gen_latch_release('ap_bill_void')`);
      }
    });

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE ap_bills SET status = 'draft' WHERE id = ${billId}::uuid
          `);
        }),
      /terminal|23514/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          const rows = resultRows<{ id: string }>(
            await db.execute(sql`
              INSERT INTO ap_bills (
                organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
              ) VALUES (
                ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 100, 100, 0, 100, 'draft'
              )
              RETURNING id
            `),
          );
          const draftId = rows[0]!.id;
          await db.execute(sql`
            INSERT INTO ap_bill_lines (
              organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
              net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id
            ) VALUES (
              ${orgId}::uuid, ${draftId}::uuid, 'bad', 1, 100, 100,
              99, 0, 100, 'ILS', 'classified', ${materialsId}::uuid
            )
          `);
          await db.execute(sql`UPDATE ap_bills SET status = 'open' WHERE id = ${draftId}::uuid`);
        }),
      /do not reconcile|23514/i,
    );
  });

  it('historical needs_classification reversal + remediation (0069→0070)', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, TAG_0069);
      const orgId = randomUUID();
      const materialsId = randomUUID();
      const histExpId = randomUUID();
      await client.exec(`
        INSERT INTO organizations (id, name, country_code, base_currency, timezone)
        VALUES ('${orgId}', 'Hist Org', 'IL', 'ILS', 'Asia/Jerusalem');
        INSERT INTO cost_categories (id, organization_id, key, name, family, is_system, sort_order)
        VALUES
          ('${materialsId}', '${orgId}', 'materials', 'Materials', 'direct_project', true, 1);
        INSERT INTO expenses (
          id, organization_id, expense_date, cost_family, cost_category_id,
          net_amount, tax_amount, gross_amount, currency, status
        ) VALUES (
          '${histExpId}', '${orgId}', '2026-01-01', 'business_overhead', NULL,
          500, 0, 500, 'ILS', 'finalized'
        );
      `);
      await applyNamed(client, TAG_0070);
      await client.exec(`
        SELECT app.next_gen_latch_acquire('expense_correction');
        INSERT INTO expenses (
          organization_id, expense_date, cost_family, cost_category_id,
          net_amount, tax_amount, gross_amount, currency, status, classification_status,
          voids_expense_id
        ) VALUES (
          '${orgId}', '2026-01-01', 'business_overhead', NULL,
          -500, 0, -500, 'ILS', 'finalized', 'needs_classification',
          '${histExpId}'
        );
        SELECT app.next_gen_latch_release('expense_correction');
      `);
      const reversalRows = await client.query<{ id: string }>(
        `SELECT id FROM expenses WHERE voids_expense_id='${histExpId}'`,
      );
      expect(reversalRows.rows).toHaveLength(1);
    });
  });

  it('historical canonical VAT AP line economics conserve bill NET/TAX/GROSS', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, TAG_0069);
      const orgId = randomUUID();
      const vendorId = randomUUID();
      const billId = randomUUID();
      const line1 = randomUUID();
      const line2 = randomUUID();
      await client.exec(`
        INSERT INTO organizations (id, name, country_code, base_currency, timezone)
        VALUES ('${orgId}', 'VAT Org', 'IL', 'ILS', 'Asia/Jerusalem');
        INSERT INTO vendors (id, organization_id, name, type)
        VALUES ('${vendorId}', '${orgId}', 'VAT Vendor', 'supplier');
        INSERT INTO ap_bills (
          id, organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount,
          tax_basis, status
        ) VALUES (
          '${billId}', '${orgId}', '${vendorId}', 'ILS', 1170, 1000, 170, 1170, 'canonical', 'open'
        );
        INSERT INTO ap_bill_lines (
          id, organization_id, ap_bill_id, description, quantity, unit_amount, line_total, currency, sort_order
        ) VALUES
          ('${line1}', '${orgId}', '${billId}', 'A', 1, 700, 700, 'ILS', 1),
          ('${line2}', '${orgId}', '${billId}', 'B', 1, 470, 470, 'ILS', 2);
      `);
      await applyNamed(client, TAG_0070);
      const sums = await client.query<{
        sum_net: string;
        sum_tax: string;
        sum_gross: string;
        legacy: boolean;
      }>(`
        SELECT
          SUM(net_amount)::text AS sum_net,
          SUM(tax_amount)::text AS sum_tax,
          SUM(gross_amount)::text AS sum_gross,
          BOOL_OR(legacy_bill_level_allocated) AS legacy
        FROM ap_bill_lines WHERE ap_bill_id='${billId}'
      `);
      expect(sums.rows[0]!.sum_net).toBe('1000.000000');
      expect(sums.rows[0]!.sum_tax).toBe('170.000000');
      expect(sums.rows[0]!.sum_gross).toBe('1170.000000');
      expect(sums.rows[0]!.legacy).toBe(true);
    });
  });

  it('canonical category family collision fails migration pre-check', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, TAG_0069);
      const orgId = randomUUID();
      await client.exec(`
        INSERT INTO organizations (id, name, country_code, base_currency, timezone)
        VALUES ('${orgId}', 'Collision Org', 'IL', 'ILS', 'Asia/Jerusalem');
        INSERT INTO cost_categories (id, organization_id, key, name, family, is_system, sort_order)
        VALUES ('${randomUUID()}', '${orgId}', 'materials', 'Wrong', 'business_overhead', true, 1);
      `);
      await expectFailure(() => applyNamed(client, TAG_0070), /conflicting family/i);
    });
  });

  it('0070 consolidated adversarial guards (DB)', async () => {
    const owner = await createTestUser(database, 'adv-0070@example.test');
    const orgId = await database.asService(async (db) => {
      const created = await createOrganization(db, owner.id, {
        name: 'Adv 0070',
        countryCode: 'IL',
      });
      return created.organization.id;
    });

    const materialsId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id=${orgId}::uuid AND key='materials' LIMIT 1
        `),
      );
      return rows[0]!.id;
    });

    const vendorId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name, type)
          VALUES (${orgId}::uuid, 'Adv Vendor', 'supplier')
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    const openBillId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
          ) VALUES (
            ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 100, 100, 0, 100, 'draft'
          )
          RETURNING id
        `),
      );
      const id = rows[0]!.id;
      await db.execute(sql`
        INSERT INTO ap_bill_lines (
          organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
          net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id
        ) VALUES (
          ${orgId}::uuid, ${id}::uuid, 'm', 1, 100, 100, 100, 0, 100, 'ILS', 'classified', ${materialsId}::uuid
        )
      `);
      await db.execute(sql`UPDATE ap_bills SET status='open' WHERE id=${id}::uuid`);
      return id;
    });

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE ap_bills SET net_amount = 90 WHERE id = ${openBillId}::uuid
          `);
        }),
      /recognized AP bill economics are immutable/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, cost_family, cost_category_id,
              net_amount, tax_amount, gross_amount, currency, status, classification_status,
              voids_expense_id
            ) VALUES (
              ${orgId}::uuid, '2026-01-01', 'business_overhead', ${materialsId}::uuid,
              -10, 0, -10, 'ILS', 'finalized', 'classified',
              gen_random_uuid()
            )
          `);
        }),
      /requires classified|voids_expense_id not found|reversal_amounts|23514|23503/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          const rows = resultRows<{ id: string }>(
            await db.execute(sql`
              INSERT INTO ap_bills (
                organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
              ) VALUES (
                ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 10, 10, 0, 10, 'draft'
              )
              RETURNING id
            `),
          );
          const draftId = rows[0]!.id;
          await db.execute(sql`
            INSERT INTO ap_bill_lines (
              organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
              net_amount, tax_amount, gross_amount, currency, classification_status,
              economic_target_type, project_id
            ) VALUES (
              ${orgId}::uuid, ${draftId}::uuid, 'bad', 1, 10, 10, 10, 0, 10, 'ILS',
              'needs_classification', 'overhead', gen_random_uuid()
            )
          `);
        }),
      /economic_target_shape|23514/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE cost_categories SET key = 'materials_renamed'
            WHERE organization_id=${orgId}::uuid AND key='materials'
          `);
        }),
      /system_cost_category_semantics_immutable/i,
    );

    expect(
      resolveExpenseTargeting({
        costFamily: 'direct_project',
        inventoryStockPurchase: true,
      }).costFamily,
    ).toBe('direct_project');
  });
});
