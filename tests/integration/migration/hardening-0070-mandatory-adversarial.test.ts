/**
 * 0070 mandatory adversarial validation — execution-only gate (no architecture changes).
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyVendorCredit,
  createApBill,
  createVendorCredit,
  postVendorCredit,
  voidApBill,
} from '@/modules/ap';
import {
  consumeInventoryCostToProject,
  createInventoryItem,
} from '@/modules/assets';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { loadRecognizedVendorBillAtomsForProject } from '@/modules/financials/data/recognized-vendor-bill-atoms.repository';
import { loadInventoryConsumptionContributionsForProject } from '@/modules/financials/data/inventory-consumptions.repository';
import {
  createPurchaseOrder,
  issuePurchaseOrder,
} from '@/modules/procurement';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { DomainRuleError } from '@/shared/errors';
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
import { provisionTwoTenants } from '../billing/setup';
import {
  isContendedConnectionError,
  isIntegrityFailure,
  openTwoConnectionHarness,
} from '../pre0021/two-connection';
import {
  OWNER_NEEDS_CLASSIFICATION_IDS,
  readOwnerPost0070Diagnostics,
  seedOwnerPre0070,
} from './helpers/owner-0070-rehearsal-seed';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
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

async function seedDraftBillForConcurrency(
  harness: Awaited<ReturnType<typeof openTwoConnectionHarness>>,
  orgId: string,
  vendorId: string,
  materialsId: string,
) {
  const billId = randomUUID();
  const lineId = randomUUID();
  await harness.sqlA`
    INSERT INTO ap_bills (
      id, organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
    ) VALUES (
      ${billId}::uuid, ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 100, 100, 0, 100, 'draft'
    )
  `;
  await harness.sqlA`
    INSERT INTO ap_bill_lines (
      id, organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
      net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id, sort_order
    ) VALUES (
      ${lineId}::uuid, ${orgId}::uuid, ${billId}::uuid, 'Materials', 1, 100, 100,
      100, 0, 100, 'ILS', 'classified', ${materialsId}::uuid, 1
    )
  `;
  return { billId, lineId };
}

async function assertBillReconciled(
  harness: Awaited<ReturnType<typeof openTwoConnectionHarness>>,
  billId: string,
) {
  const rows = await harness.sqlA`
    SELECT
      b.status,
      b.net_amount::text,
      b.tax_amount::text,
      b.gross_amount::text,
      COALESCE(SUM(l.net_amount), 0)::text AS sum_net,
      COALESCE(SUM(l.tax_amount), 0)::text AS sum_tax,
      COALESCE(SUM(l.gross_amount), 0)::text AS sum_gross,
      COUNT(l.id)::text AS line_count
    FROM ap_bills b
    LEFT JOIN ap_bill_lines l ON l.ap_bill_id = b.id
    WHERE b.id = ${billId}::uuid
    GROUP BY b.id, b.status, b.net_amount, b.tax_amount, b.gross_amount
  `;
  const row = rows[0];
  if (!row) throw new Error('bill missing');
  if (row.status === 'open' || row.status === 'partially_matched' || row.status === 'matched') {
    expect(Number(row.line_count)).toBeGreaterThan(0);
    expect(row.sum_net).toBe(row.net_amount);
    expect(row.sum_tax).toBe(row.tax_amount);
    expect(row.sum_gross).toBe(row.gross_amount);
  }
}

describe('0070 mandatory adversarial validation', () => {
  describe('1) AP posting concurrency (two-session)', () => {
    for (const mode of ['insert', 'update', 'delete'] as const) {
      it(`posting vs concurrent line ${mode.toUpperCase()} is serialized or denied`, async () => {
        const harness = await openTwoConnectionHarness(async (client) => {
          await applySqlMigrations(client);
        });
        try {
          const orgId = randomUUID();
          const vendorId = randomUUID();
          const materialsId = randomUUID();
          await harness.sqlA`
            INSERT INTO organizations (id, name, country_code, base_currency, timezone)
            VALUES (${orgId}::uuid, 'Race Org', 'IL', 'ILS', 'Asia/Jerusalem')
          `;
          await harness.sqlA`
            INSERT INTO vendors (id, organization_id, name, type)
            VALUES (${vendorId}::uuid, ${orgId}::uuid, 'V', 'supplier')
          `;
          await harness.sqlA`
            INSERT INTO cost_categories (id, organization_id, key, name, family, is_system, sort_order)
            VALUES (${materialsId}::uuid, ${orgId}::uuid, 'materials', 'Materials', 'direct_project', true, 1)
          `;

          const { billId, lineId } = await seedDraftBillForConcurrency(
            harness,
            orgId,
            vendorId,
            materialsId,
          );

          const results = await Promise.allSettled([
            harness.sqlA.begin(async (tx) => {
              await tx`UPDATE ap_bills SET status = 'open' WHERE id = ${billId}::uuid`;
            }),
            harness.sqlB.begin(async (tx) => {
              if (mode === 'insert') {
                await tx`
                  INSERT INTO ap_bill_lines (
                    organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
                    net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id, sort_order
                  ) VALUES (
                    ${orgId}::uuid, ${billId}::uuid, 'Race line', 1, 50, 50,
                    50, 0, 50, 'ILS', 'classified', ${materialsId}::uuid, 2
                  )
                `;
              } else if (mode === 'update') {
                await tx`
                  UPDATE ap_bill_lines
                  SET net_amount = 90, line_total = 90, gross_amount = 90
                  WHERE id = ${lineId}::uuid
                `;
              } else {
                await tx`DELETE FROM ap_bill_lines WHERE id = ${lineId}::uuid`;
              }
            }),
          ]);

          const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (rejected.length > 0) {
            for (const result of rejected) {
              expect(
                isIntegrityFailure(result.reason, 'immutable') ||
                  isIntegrityFailure(result.reason, 'reconcile') ||
                  isIntegrityFailure(result.reason, 'recognized') ||
                  isIntegrityFailure(result.reason, 'inserted') ||
                  isContendedConnectionError(result.reason) ||
                  /immutable|reconcile|recognized|inserted|23514|restrict/i.test(
                    String(result.reason),
                  ),
              ).toBe(true);
            }
          }

          await assertBillReconciled(harness, billId);
        } finally {
          await harness.close();
        }
      });
    }
  });

  describe('2) Trusted AP void + PO commitment', () => {
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

    it('naked void denied; trusted void restores PO commitment exactly once', async () => {
      const owner = await createTestUser(database, 'void-po@example.test');
      const orgId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Void PO Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const seeded = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId: orgId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'PO Vendor' });
        const project = await createProject(context, { name: 'PO Project' });
        const po = await createPurchaseOrder(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: 'ILS',
          committedAmount: '1000',
          lines: [
            {
              description: 'Cable',
              quantity: '10',
              unitAmount: '100',
              lineTotal: '1000',
              currency: 'ILS',
            },
          ],
        });
        const issued = await issuePurchaseOrder(context, { purchaseOrderId: po.id });
        const materials = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgId}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!.id;

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          purchaseOrderId: issued.id,
          currency: 'ILS',
          totalAmount: '400',
          lines: [
            {
              description: 'Materials',
              quantity: '1',
              unitAmount: '400',
              lineTotal: '400',
              currency: 'ILS',
              costCategoryId: materials,
              costFamily: 'direct_project',
            },
          ],
        });

        const committedBefore = resultRows<{ amount: string; status: string }>(
          await tx.execute(sql`
            SELECT amount::text, status
            FROM committed_costs
            WHERE organization_id = ${orgId}::uuid AND purchase_order_id = ${issued.id}::uuid
            LIMIT 1
          `),
        )[0];

        return { context, bill, issued, committedBefore };
      });

      expect(Number(seeded.committedBefore?.amount ?? 0)).toBeLessThan(1000);

      await expectFailure(
        () =>
          database.asService(async (db) => {
            await db.execute(sql`
              UPDATE ap_bills SET status = 'void' WHERE id = ${seeded.bill.id}::uuid
            `);
          }),
        /ap_bill_void_trusted_path_required|23514/i,
      );

      await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId: orgId,
          locale: 'en',
        });
        await voidApBill(context, { billId: seeded.bill.id });
      });

      const afterVoid = await database.asService(async (db) => {
        const bill = resultRows<{ status: string }>(
          await db.execute(sql`SELECT status FROM ap_bills WHERE id = ${seeded.bill.id}::uuid`),
        )[0];
        const committed = resultRows<{ amount: string }>(
          await db.execute(sql`
            SELECT amount::text FROM committed_costs
            WHERE organization_id = ${orgId}::uuid AND purchase_order_id = ${seeded.issued.id}::uuid
          `),
        )[0];
        return { bill, committed };
      });

      expect(afterVoid.bill?.status).toBe('void');
      expect(Number(afterVoid.committed?.amount ?? 0)).toBe(1000);

      await expect(
        database.asUser(owner.id, async (tx) => {
          const context = await resolveOrgContext(tx, {
            userId: owner.id,
            organizationId: orgId,
            locale: 'en',
          });
          return voidApBill(context, { billId: seeded.bill.id });
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      const committedAgain = await database.asService(async (db) =>
        resultRows<{ amount: string }>(
          await db.execute(sql`
            SELECT amount::text FROM committed_costs
            WHERE organization_id = ${orgId}::uuid AND purchase_order_id = ${seeded.issued.id}::uuid
          `),
        ),
      );
      expect(Number(committedAgain[0]?.amount ?? 0)).toBe(1000);
    });
  });

  describe('3) Vendor credit targeting', () => {
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

    it('known-target credit reduces Project A only; untargeted credit reconciles proportionally', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const ctx = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Mixed Vendor' });
        const projectA = await createProject(context, { name: 'Project A' });
        const projectB = await createProject(context, { name: 'Project B' });
        const cats = resultRows<{ id: string; key: string }>(
          await tx.execute(sql`
            SELECT id, key FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid
              AND key IN ('materials', 'external_service')
          `),
        );
        const catByKey = Object.fromEntries(cats.map((c) => [c.key, c.id]));

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          currency: 'ILS',
          totalAmount: '15000',
          amountIncludesTax: false,
          lines: [
            {
              description: 'A materials',
              quantity: '1',
              unitAmount: '10000',
              lineTotal: '10000',
              currency: 'ILS',
              costCategoryId: catByKey.materials,
              costFamily: 'direct_project',
              economicTargetType: 'project',
              projectId: projectA.projectId,
            },
            {
              description: 'B service',
              quantity: '1',
              unitAmount: '5000',
              lineTotal: '5000',
              currency: 'ILS',
              costCategoryId: catByKey.external_service,
              costFamily: 'direct_project',
              economicTargetType: 'project',
              projectId: projectB.projectId,
            },
          ],
        });

        const atomsBeforeA = await loadRecognizedVendorBillAtomsForProject(
          tx,
          orgA.organization.id,
          projectA.projectId,
          'ILS',
        );
        const atomsBeforeB = await loadRecognizedVendorBillAtomsForProject(
          tx,
          orgA.organization.id,
          projectB.projectId,
          'ILS',
        );
        const totalBeforeA = atomsBeforeA.reduce((s, a) => s + Number(a.amount.amount), 0);
        const totalBeforeB = atomsBeforeB.reduce((s, a) => s + Number(a.amount.amount), 0);
        expect(totalBeforeA).toBeCloseTo(10000, 2);
        expect(totalBeforeB).toBeCloseTo(5000, 2);

        const targetedCredit = await createVendorCredit(context, {
          vendorId: vendor.id,
          apBillId: bill.id,
          projectId: projectA.projectId,
          creditDate: '2026-08-01',
          currency: 'ILS',
          amount: '1170',
          amountIncludesTax: false,
          netAmount: '1000',
          taxAmount: '170',
        });
        const postedTargeted = await postVendorCredit(context, targetedCredit.id);
        await applyVendorCredit(context, {
          creditId: postedTargeted.id,
          apBillId: bill.id,
          amount: '1170',
        });

        const atomsAfterTargetedA = await loadRecognizedVendorBillAtomsForProject(
          tx,
          orgA.organization.id,
          projectA.projectId,
          'ILS',
        );
        const atomsAfterTargetedB = await loadRecognizedVendorBillAtomsForProject(
          tx,
          orgA.organization.id,
          projectB.projectId,
          'ILS',
        );
        const totalAfterTargetedA = atomsAfterTargetedA.reduce((s, a) => s + Number(a.amount.amount), 0);
        const totalAfterTargetedB = atomsAfterTargetedB.reduce((s, a) => s + Number(a.amount.amount), 0);

        expect(totalAfterTargetedA).toBeCloseTo(9000, 2);
        expect(totalAfterTargetedB).toBeCloseTo(5000, 2);

        const untargetedCredit = await createVendorCredit(context, {
          vendorId: vendor.id,
          apBillId: bill.id,
          creditDate: '2026-08-02',
          currency: 'ILS',
          amount: '1500',
          amountIncludesTax: false,
          netAmount: '1500',
          taxAmount: '0',
        });
        const postedUntargeted = await postVendorCredit(context, untargetedCredit.id);
        await applyVendorCredit(context, {
          creditId: postedUntargeted.id,
          apBillId: bill.id,
          amount: '1500',
        });

        const atomsFinalA = await loadRecognizedVendorBillAtomsForProject(
          tx,
          orgA.organization.id,
          projectA.projectId,
          'ILS',
        );
        const atomsFinalB = await loadRecognizedVendorBillAtomsForProject(
          tx,
          orgA.organization.id,
          projectB.projectId,
          'ILS',
        );
        const finalA = atomsFinalA.reduce((s, a) => s + Number(a.amount.amount), 0);
        const finalB = atomsFinalB.reduce((s, a) => s + Number(a.amount.amount), 0);
        const companyReduction = 1000 + 1500;
        const remaining = finalA + finalB;
        expect(15000 - remaining).toBeCloseTo(companyReduction, 2);
        expect(15000 - (finalA + finalB + companyReduction)).toBeCloseTo(0, 2);

        return { billId: bill.id };
      });

      expect(ctx.billId).toBeTruthy();
    });
  });

  describe('4) Central inventory materials purchase E2E', () => {
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

    it('purchase Operating Actual=0; FIFO consume posts 2500 to Project A', async () => {
      const owner = await createTestUser(database, 'inv-0070@example.test');
      const orgId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Inv Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const result = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId: orgId,
          locale: 'en',
        });
        const project = await createProject(context, { name: 'Consume A' });
        const item = await createInventoryItem(context, {
          name: 'Central stock wire',
          unit: 'm',
        });
        const materialsId = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgId}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!.id;

        const draft = await createExpense(context, {
          amount: '10000',
          currency: 'ILS',
          amountIncludesTax: false,
          costCategoryId: materialsId,
          costFamily: 'direct_project',
          inventoryStockPurchase: true,
          inventoryItemId: item.id,
          inventoryPurchaseQty: '100',
        });
        const finalized = await finalizeExpense(context, draft.id);

        const operatingBefore = resultRows<{ s: string }>(
          await tx.execute(sql`
            SELECT COALESCE(SUM(net_amount), 0)::text AS s
            FROM expenses
            WHERE organization_id = ${orgId}::uuid
              AND status = 'finalized'
              AND COALESCE(inventory_stock_purchase, false) = false
          `),
        )[0]!.s;
        expect(Number(operatingBefore)).toBe(0);

        const itemRow = resultRows<{ basis: string }>(
          await tx.execute(sql`
            SELECT cost_basis_amount::text AS basis
            FROM inventory_items WHERE id = ${item.id}::uuid
          `),
        );
        expect(Number(itemRow[0]!.basis)).toBeCloseTo(10000, 2);

        await consumeInventoryCostToProject(context, {
          inventoryItemId: item.id,
          quantity: '25',
          occurredOn: '2026-08-15',
          kind: 'project_consume',
          projectId: project.projectId,
        });

        const consumptions = await loadInventoryConsumptionContributionsForProject(
          tx,
          orgId,
          project.projectId,
        );
        const projectMaterials = consumptions.reduce(
          (sum, row) => sum + Number(row.amount),
          0,
        );
        expect(projectMaterials).toBeCloseTo(2500, 2);

        const operatingAfter = resultRows<{ s: string }>(
          await tx.execute(sql`
            SELECT COALESCE(SUM(net_amount), 0)::text AS s
            FROM expenses
            WHERE organization_id = ${orgId}::uuid
              AND status = 'finalized'
              AND project_id IS NOT NULL
              AND COALESCE(inventory_stock_purchase, false) = false
          `),
        )[0]!.s;
        expect(Number(operatingAfter)).toBe(0);

        return { expenseId: finalized.id };
      });

      expect(result.expenseId).toBeTruthy();
    });
  });

  describe('5) Owner historical migration rehearsal (isolated PGlite)', () => {
    it('0069 → 0070 preserves Owner expense economics and classification counts', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client, '0069_true_cost_profitability');
        const before = await seedOwnerPre0070(client);
        expect(before.finalizedCount).toBe(54);

        await applyNamed(client, TAG_0070);

        const after = await readOwnerPost0070Diagnostics(client);
        expect(after.netSumAfter).toBe(before.netSumBefore);
        expect(after.classified).toBe(51);
        expect(after.needsClassification).toBe(3);

        for (const expenseId of OWNER_NEEDS_CLASSIFICATION_IDS) {
          const row = await client.query<{ classification_status: string }>(
            `SELECT classification_status FROM expenses WHERE id='${expenseId}'`,
          );
          expect(row.rows[0]?.classification_status).toBe('needs_classification');
        }

        const histRows = await client.query<{ description: string | null; cost_category_id: string | null }>(
          `SELECT description, cost_category_id FROM expenses WHERE id IN (
            '${OWNER_NEEDS_CLASSIFICATION_IDS.join("','")}'
          )`,
        );
        const descs = histRows.rows.map((r) => r.description);
        expect(histRows.rows.filter((r) => r.cost_category_id == null).length).toBe(2);
        expect(descs.some((d) => d === 'גילוי אש')).toBe(true);

        expect(Number(after.projectDirectNet) + Number(after.overheadNet)).toBeCloseTo(
          Number(after.netSumAfter),
          2,
        );
      });
    });
  });

  describe('6) Cross-project AP line access', () => {
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

    it('restricted user cannot write AP line to inaccessible project', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);
      const scoped = await createTestUser(database, 'scoped-ap@example.test');
      const roleId = randomUUID();
      const membershipId = randomUUID();

      const ids = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const projectA = await createProject(context, { name: 'Accessible A' });
        const projectB = await createProject(context, { name: 'Restricted B' });
        const vendor = await createVendor(context, { name: 'Scoped Vendor' });
        const materials = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!.id;
        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: projectA.projectId,
          currency: 'ILS',
          totalAmount: '100',
          asDraft: true,
          lines: [
            {
              description: 'seed',
              quantity: '1',
              unitAmount: '100',
              lineTotal: '100',
              currency: 'ILS',
              costCategoryId: materials,
              costFamily: 'direct_project',
            },
          ],
        });
        return { projectA: projectA.projectId, projectB: projectB.projectId, billId: bill.id, materials };
      });

      await database.asService(async (db) => {
        await db.execute(sql`SET ROLE service_role`);
        await db.execute(sql`
          INSERT INTO organization_settings (organization_id, key, value)
          VALUES (${orgA.organization.id}::uuid, 'project_access_mode', '"selected"'::jsonb)
          ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value
        `);
        await db.execute(sql`
          INSERT INTO organization_memberships (id, organization_id, user_id, status)
          VALUES (${membershipId}::uuid, ${orgA.organization.id}::uuid, ${scoped.id}::uuid, 'active')
        `);
        await db.execute(sql`
          INSERT INTO roles (id, organization_id, key, name, rank, is_protected)
          VALUES (${roleId}::uuid, ${orgA.organization.id}::uuid, 'scoped_ap', 'Scoped AP', 50, false)
        `);
        await db.execute(sql`
          INSERT INTO role_permissions (organization_id, role_id, permission_key)
          VALUES
            (${orgA.organization.id}::uuid, ${roleId}::uuid, 'ap.manage'),
            (${orgA.organization.id}::uuid, ${roleId}::uuid, 'ap.read'),
            (${orgA.organization.id}::uuid, ${roleId}::uuid, 'projects.read')
        `);
        await db.execute(sql`
          INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
          VALUES (${orgA.organization.id}::uuid, ${membershipId}::uuid, ${scoped.id}::uuid, ${roleId}::uuid)
        `);
        await db.execute(sql`
          INSERT INTO project_access_grants (organization_id, user_id, project_id, access_level)
          VALUES (${orgA.organization.id}::uuid, ${scoped.id}::uuid, ${ids.projectA}::uuid, 'read')
        `);
      });

      await database.asUser(scoped.id, async (tx) => {
        await tx.execute(sql`select set_config('request.jwt.claim.sub', ${scoped.id}, true)`);
        await expectFailure(
          async () => {
            await tx.execute(sql`
              INSERT INTO ap_bill_lines (
                organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
                net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id,
                economic_target_type, project_id, sort_order
              ) VALUES (
                ${orgA.organization.id}::uuid, ${ids.billId}::uuid, 'cross', 1, 10, 10,
                10, 0, 10, 'ILS', 'classified', ${ids.materials}::uuid,
                'project', ${ids.projectB}::uuid, 2
              )
            `);
          },
          /permission denied|42501|violates row-level security|project access/i,
        );
      });

      await database.asUser(userA.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO ap_bill_lines (
            organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
            net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id,
            economic_target_type, project_id, sort_order
          ) VALUES (
            ${orgA.organization.id}::uuid, ${ids.billId}::uuid, 'allowed', 1, 10, 10,
            10, 0, 10, 'ILS', 'classified', ${ids.materials}::uuid,
            'project', ${ids.projectA}::uuid, 2
          )
        `);
      });
    });
  });

  describe('7) Void terminal status matrix', () => {
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

    it('void is terminal; recognized lifecycle preserves Actual once', async () => {
      const owner = await createTestUser(database, 'void-matrix@example.test');
      const orgId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Void Matrix',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const billId = await database.asService(async (db) => {
        const vendorRows = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO vendors (organization_id, name, type)
            VALUES (${orgId}::uuid, 'V', 'supplier') RETURNING id
          `),
        );
        const materials = resultRows<{ id: string }>(
          await db.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgId}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!.id;
        const rows = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
            ) VALUES (
              ${orgId}::uuid, ${vendorRows[0]!.id}::uuid, 'ILS', 100, 100, 0, 100, 'draft'
            ) RETURNING id
          `),
        );
        const id = rows[0]!.id;
        await db.execute(sql`
          INSERT INTO ap_bill_lines (
            organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
            net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id
          ) VALUES (
            ${orgId}::uuid, ${id}::uuid, 'm', 1, 100, 100, 100, 0, 100, 'ILS', 'classified', ${materials}::uuid
          )
        `);
        await db.execute(sql`UPDATE ap_bills SET status = 'open' WHERE id = ${id}::uuid`);
        return id;
      });

      await database.asService(async (db) => {
        await db.execute(sql`SELECT app.next_gen_latch_acquire('ap_bill_void')`);
        try {
          await db.execute(sql`UPDATE ap_bills SET status = 'void' WHERE id = ${billId}::uuid`);
        } finally {
          await db.execute(sql`SELECT app.next_gen_latch_release('ap_bill_void')`);
        }
      });

      for (const target of ['draft', 'open', 'partially_matched', 'matched'] as const) {
        await expectFailure(
          () =>
            database.asService(async (db) => {
              await db.execute(sql`
                UPDATE ap_bills SET status = ${target} WHERE id = ${billId}::uuid
              `);
            }),
          /terminal|23514/i,
        );
      }

      const lifecycleBillId = await database.asService(async (db) => {
        const vendorRows = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO vendors (organization_id, name, type)
            VALUES (${orgId}::uuid, 'V2', 'supplier') RETURNING id
          `),
        );
        const materials = resultRows<{ id: string }>(
          await db.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgId}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!.id;
        const rows = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount, status
            ) VALUES (
              ${orgId}::uuid, ${vendorRows[0]!.id}::uuid, 'ILS', 200, 200, 0, 200, 'draft'
            ) RETURNING id
          `),
        );
        const id = rows[0]!.id;
        await db.execute(sql`
          INSERT INTO ap_bill_lines (
            organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
            net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id
          ) VALUES (
            ${orgId}::uuid, ${id}::uuid, 'm', 1, 200, 200, 200, 0, 200, 'ILS', 'classified', ${materials}::uuid
          )
        `);
        await db.execute(sql`UPDATE ap_bills SET status = 'open' WHERE id = ${id}::uuid`);
        await db.execute(sql`UPDATE ap_bills SET status = 'partially_matched' WHERE id = ${id}::uuid`);
        await db.execute(sql`UPDATE ap_bills SET status = 'matched' WHERE id = ${id}::uuid`);
        return id;
      });

      const net = await database.asService(async (db) => {
        const rows = resultRows<{ net: string; status: string }>(
          await db.execute(sql`
            SELECT net_amount::text AS net, status FROM ap_bills WHERE id = ${lifecycleBillId}::uuid
          `),
        );
        return rows[0];
      });
      expect(net?.status).toBe('matched');
      expect(Number(net?.net ?? 0)).toBe(200);
    });
  });
});
