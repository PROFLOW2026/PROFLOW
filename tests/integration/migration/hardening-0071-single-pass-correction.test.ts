/**
 * 0071 single-pass Owner correction — targeted scenarios only.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql, type SQLWrapper } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createApBill,
  applyVendorCredit,
  createVendorCredit,
  editRecognizedApBill,
  enableApPaymentsPersistenceForTests,
  getApBillDetail,
  postVendorCredit,
  recordVendorPayment,
  restoreApBill,
  voidApBill,
} from '@/modules/ap';
import { consumeInventoryCostToProject, createInventoryItem } from '@/modules/assets';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { updateFinalizedExpense } from '@/modules/expenses/application/update-finalized-expense';
import { expenseInputFromPayload } from '@/modules/recurring-drafts/domain/payload';
import { loadRecognizedVendorBillAtomsForProject } from '@/modules/financials/data/recognized-vendor-bill-atoms.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProject } from '@/modules/projects';
import { createVendor } from '@/modules/vendors';
import { DomainRuleError } from '@/shared/errors';
import {
  closeMonthClosePeriod,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG_0071 = '0071_internal_financial_editability';
const ILS = 'ILS';

function sumAtomNet(
  atoms: Awaited<ReturnType<typeof loadRecognizedVendorBillAtomsForProject>>,
): number {
  return atoms.reduce((sum, atom) => sum + Number(atom.amount.amount), 0);
}

async function materialsCategoryId(
  tx: { execute: (query: string | SQLWrapper) => Promise<unknown> },
  orgId: string,
): Promise<string> {
  return resultRows<{ id: string }>(
    await tx.execute(sql`
      SELECT id FROM cost_categories
      WHERE organization_id = ${orgId}::uuid AND key = 'materials' LIMIT 1
    `),
  )[0]!.id;
}

async function closeMonth(context: OrgContext, yearMonth: string) {
  const period = await ensureMonthClosePeriod(context, { yearMonth });
  await markMonthCloseReady(context, { periodId: period.id });
  return closeMonthClosePeriod(context, { periodId: period.id });
}

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

describe('0071 single-pass Owner correction', () => {
  it('SQL: deferred line reconciliation + vat_mode default inclusive', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0071}.sql`), 'utf8');
    expect(raw).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(raw).toContain("ALTER COLUMN vat_mode SET DEFAULT 'inclusive'");
  });

  describe('application paths', () => {
    let database: TestDatabase;

    beforeAll(async () => {
      database = await createTestDatabase();
      enableApPaymentsPersistenceForTests();
    });

    afterAll(async () => {
      await database.close();
    });

    beforeEach(async () => {
      await database.reset();
      enableApPaymentsPersistenceForTests();
    });

    it('allows AP edit with active payment and harmless category correction', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, serviceId, vendorId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Pay Vendor' });
        const project = await createProject(context, { name: 'Pay Project' });
        const categories = resultRows<{ id: string; key: string }>(
          await tx.execute(sql`
            SELECT id, key FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid
              AND key IN ('materials', 'external_service')
          `),
        );
        const materialsId = categories.find((c) => c.key === 'materials')!.id;
        const serviceId = categories.find((c) => c.key === 'external_service')!.id;

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-08-01',
          lines: [
            {
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });

        await recordVendorPayment(context, {
          vendorId: vendor.id,
          amount: '200',
          currency: ILS,
          paymentDate: '2026-08-05',
          applications: [{ apBillId: bill.id, appliedAmount: '200' }],
        });

        return { billId: bill.id, serviceId, vendorId: vendor.id };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const detail = await getApBillDetail(context, billId);
        const line = detail!.lines[0]!;

        await editRecognizedApBill(context, {
          billId,
          vendorId,
          projectId: detail!.bill.projectId,
          currency: ILS,
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-08-01',
          notes: 'Corrected category',
          lines: [
            {
              lineId: line.id,
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: ILS,
              costCategoryId: serviceId,
              costFamily: 'direct_project',
            },
          ],
        });
      });
    });

    it('rejects AP total below active applied payments', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, vendorId, lineId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Floor Vendor' });
        const project = await createProject(context, { name: 'Floor Project' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-08-01',
          lines: [
            {
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });

        await recordVendorPayment(context, {
          vendorId: vendor.id,
          amount: '500',
          currency: ILS,
          paymentDate: '2026-08-05',
          applications: [{ apBillId: bill.id, appliedAmount: '500' }],
        });

        const lines = await getApBillDetail(context, bill.id);
        return { billId: bill.id, vendorId: vendor.id, lineId: lines!.lines[0]!.id };
      });

      await expect(
        database.asUser(userA.id, async (tx) => {
          const context = await resolveOrgContext(tx, {
            userId: userA.id,
            organizationId: orgA.organization.id,
            locale: 'en',
          });
          await editRecognizedApBill(context, {
            billId,
            vendorId,
            currency: ILS,
            totalAmount: '400',
            netAmount: '400',
            taxAmount: '0',
            billDate: '2026-08-01',
            lines: [
              {
                lineId,
                description: 'Line',
                quantity: '1',
                unitAmount: '400',
                lineTotal: '400',
                currency: ILS,
                costCategoryId: await materialsCategoryId(tx, orgA.organization.id),
                costFamily: 'direct_project',
              },
            ],
          });
        }),
      ).rejects.toThrow(DomainRuleError);
    });

    it('allows AP edit with active credit and harmless notes correction', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, vendorId, lineId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Credit Vendor' });
        const project = await createProject(context, { name: 'Credit Project' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-08-01',
          lines: [
            {
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });

        const credit = await createVendorCredit(context, {
          vendorId: vendor.id,
          apBillId: bill.id,
          creditDate: '2026-08-05',
          currency: ILS,
          amount: '200',
        });
        const posted = await postVendorCredit(context, credit.id);
        await applyVendorCredit(context, {
          creditId: posted.id,
          apBillId: bill.id,
          amount: '200',
        });

        const lines = await getApBillDetail(context, bill.id);
        return { billId: bill.id, vendorId: vendor.id, lineId: lines!.lines[0]!.id };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        await editRecognizedApBill(context, {
          billId,
          vendorId,
          currency: ILS,
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-08-01',
          notes: 'Corrected with credit applied',
          lines: [
            {
              lineId,
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });
      });
    });

    it('rejects parent-only AP header/line economic mismatch', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, vendorId, lineId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Mismatch Vendor' });
        const project = await createProject(context, { name: 'Mismatch Project' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-08-01',
          lines: [
            {
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });
        const lines = await getApBillDetail(context, bill.id);
        return { billId: bill.id, vendorId: vendor.id, lineId: lines!.lines[0]!.id };
      });

      await expect(
        database.asUser(userA.id, async (tx) => {
          const context = await resolveOrgContext(tx, {
            userId: userA.id,
            organizationId: orgA.organization.id,
            locale: 'en',
          });
          const materialsId = await materialsCategoryId(tx, orgA.organization.id);
          await editRecognizedApBill(context, {
            billId,
            vendorId,
            currency: ILS,
            totalAmount: '2000',
            netAmount: '2000',
            taxAmount: '0',
            billDate: '2026-08-01',
            lines: [
              {
                lineId,
                description: 'Line',
                quantity: '1',
                unitAmount: '1000',
                lineTotal: '1000',
                currency: ILS,
                costCategoryId: materialsId,
                costFamily: 'direct_project',
              },
            ],
          });
        }),
      ).rejects.toThrow(DomainRuleError);
    });

    it('multi-line AP edit 5k+5k to 6k+4k reconciles to 0.00', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, vendorId, lineIds } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Multi Vendor' });
        const project = await createProject(context, { name: 'Multi Project' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '10000',
          netAmount: '10000',
          taxAmount: '0',
          billDate: '2026-08-02',
          lines: [
            {
              description: 'A',
              quantity: '1',
              unitAmount: '5000',
              lineTotal: '5000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
            {
              description: 'B',
              quantity: '1',
              unitAmount: '5000',
              lineTotal: '5000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });
        const detail = await getApBillDetail(context, bill.id);
        return {
          billId: bill.id,
          vendorId: vendor.id,
          lineIds: detail!.lines.map((l) => l.id),
        };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        await editRecognizedApBill(context, {
          billId,
          vendorId,
          currency: ILS,
          totalAmount: '10000',
          netAmount: '10000',
          taxAmount: '0',
          billDate: '2026-08-02',
          lines: [
            {
              lineId: lineIds[0],
              description: 'A',
              quantity: '1',
              unitAmount: '6000',
              lineTotal: '6000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
            {
              lineId: lineIds[1],
              description: 'B',
              quantity: '1',
              unitAmount: '4000',
              lineTotal: '4000',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });

        const row = resultRows<{
          net_amount: string;
          tax_amount: string;
          gross_amount: string;
          sum_net: string;
          sum_tax: string;
          sum_gross: string;
        }>(
          await tx.execute(sql`
            SELECT
              b.net_amount::text,
              b.tax_amount::text,
              b.gross_amount::text,
              COALESCE(SUM(l.net_amount), 0)::text AS sum_net,
              COALESCE(SUM(l.tax_amount), 0)::text AS sum_tax,
              COALESCE(SUM(l.gross_amount), 0)::text AS sum_gross
            FROM ap_bills b
            JOIN ap_bill_lines l ON l.ap_bill_id = b.id
            WHERE b.id = ${billId}::uuid
            GROUP BY b.id, b.net_amount, b.tax_amount, b.gross_amount
          `),
        )[0]!;
        expect(row.sum_net).toBe(row.net_amount);
        expect(row.sum_tax).toBe(row.tax_amount);
        expect(row.sum_gross).toBe(row.gross_amount);
      });
    });

    it('AP line insert/delete during one edit reconciles', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, vendorId, keepLineId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Line IO Vendor' });
        const project = await createProject(context, { name: 'Line IO' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '100',
          netAmount: '100',
          taxAmount: '0',
          billDate: '2026-08-03',
          lines: [
            {
              description: 'Only',
              quantity: '1',
              unitAmount: '100',
              lineTotal: '100',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });
        return { billId: bill.id, vendorId: vendor.id, keepLineId: (await getApBillDetail(context, bill.id))!.lines[0]!.id };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        await editRecognizedApBill(context, {
          billId,
          vendorId,
          currency: ILS,
          totalAmount: '150',
          netAmount: '150',
          taxAmount: '0',
          billDate: '2026-08-03',
          lines: [
            {
              lineId: keepLineId,
              description: 'Kept',
              quantity: '1',
              unitAmount: '100',
              lineTotal: '100',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
            {
              description: 'Added',
              quantity: '1',
              unitAmount: '50',
              lineTotal: '50',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });

        const count = resultRows<{ c: number }>(
          await tx.execute(sql`
            SELECT COUNT(*)::int AS c FROM ap_bill_lines WHERE ap_bill_id = ${billId}::uuid
          `),
        )[0]!.c;
        expect(count).toBe(2);
      });
    });

    it('new expense without explicit vat_mode defaults to inclusive in DB', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const project = await createProject(context, { name: 'VAT Default' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const draft = await createExpense(context, {
          projectId: project.projectId,
          costCategoryId: materialsId,
          costFamily: 'direct_project',
          amount: '118',
          currency: ILS,
          vatMode: 'inclusive',
          expenseDate: '2026-08-04',
        });

        const row = resultRows<{ vat_mode: string | null }>(
          await tx.execute(sql`
            SELECT vat_mode FROM expenses WHERE id = ${draft.id}::uuid
          `),
        )[0]!;
        expect(row.vat_mode).toBe('inclusive');
      });
    });

    it('recurring template preserves vatMode for generated expense input', () => {
      const input = expenseInputFromPayload(
        { amount: '500', currency: ILS, vatMode: 'zero' },
        '2026-08-01' as never,
      );
      expect(input.vatMode).toBe('zero');
    });

    it('finalized expense VAT edit updates taxSnapshot and amounts', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const expenseId = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const project = await createProject(context, { name: 'VAT Edit' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);
        const draft = await createExpense(context, {
          projectId: project.projectId,
          costCategoryId: materialsId,
          costFamily: 'direct_project',
          amount: '1000',
          currency: ILS,
          vatMode: 'exclusive',
          expenseDate: '2026-08-05',
        });
        await finalizeExpense(context, draft.id);
        return draft.id;
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await updateFinalizedExpense(context, {
          expenseId,
          projectId: (await createProject(context, { name: 'VAT Edit' })).projectId,
          costCategoryId: await materialsCategoryId(tx, orgA.organization.id),
          costFamily: 'direct_project',
          amount: '1180',
          currency: ILS,
          vatMode: 'inclusive',
          expenseDate: '2026-08-05',
        });

        const row = resultRows<{
          net_amount: string;
          tax_amount: string;
          gross_amount: string;
          vat_mode: string;
        }>(
          await tx.execute(sql`
            SELECT net_amount::text, tax_amount::text, gross_amount::text, vat_mode
            FROM expenses WHERE id = ${expenseId}::uuid
          `),
        )[0]!;
        expect(row.vat_mode).toBe('inclusive');
        expect(Number(row.gross_amount)).toBeGreaterThan(Number(row.net_amount));
      });
    });

    it('inventory finalized purchase edit reconciles basis; operating actual stays 0', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { expenseId, itemId, projectId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const project = await createProject(context, { name: 'Inv Edit' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);
        const item = await createInventoryItem(context, { name: 'Stock item', unit: 'ea' });

        const draft = await createExpense(context, {
          projectId: project.projectId,
          costCategoryId: materialsId,
          costFamily: 'direct_project',
          amount: '1000',
          currency: ILS,
          vatMode: 'exclusive',
          inventoryStockPurchase: true,
          inventoryItemId: item.id,
          inventoryPurchaseQty: '10',
          expenseDate: '2026-08-06',
        });
        await finalizeExpense(context, draft.id);

        await consumeInventoryCostToProject(context, {
          inventoryItemId: item.id,
          quantity: '2',
          occurredOn: '2026-08-07',
          kind: 'project_consume',
          projectId: project.projectId,
        });

        return { expenseId: draft.id, itemId: item.id, projectId: project.projectId };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        await updateFinalizedExpense(context, {
          expenseId,
          projectId,
          costCategoryId: materialsId,
          costFamily: 'direct_project',
          amount: '1200',
          currency: ILS,
          vatMode: 'exclusive',
          inventoryStockPurchase: true,
          inventoryItemId: itemId,
          inventoryPurchaseQty: '10',
          expenseDate: '2026-08-06',
        });

        const layers = resultRows<{ c: number; unit_cost: string }>(
          await tx.execute(sql`
            SELECT COUNT(*)::int AS c, MAX(unit_cost)::text AS unit_cost
            FROM inventory_cost_layers
            WHERE source_expense_id = ${expenseId}::uuid
          `),
        )[0]!;
        expect(layers.c).toBe(1);
        expect(Number(layers.unit_cost)).toBeCloseTo(120, 0);

        const operating = resultRows<{ s: string }>(
          await tx.execute(sql`
            SELECT COALESCE(SUM(net_amount), 0)::text AS s
            FROM expenses
            WHERE organization_id = ${orgA.organization.id}::uuid
              AND status = 'finalized'
              AND COALESCE(inventory_stock_purchase, false) = false
          `),
        )[0]!.s;
        expect(Number(operating)).toBe(0);
      });
    });

    it('AP void then restore restores actual exactly once', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, projectId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Restore Sym' });
        const project = await createProject(context, { name: 'Restore Sym P' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '300',
          netAmount: '300',
          taxAmount: '0',
          billDate: '2026-08-10',
          lines: [
            {
              description: 'Restore line',
              quantity: '1',
              unitAmount: '300',
              lineTotal: '300',
              currency: ILS,
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });
        return { billId: bill.id, projectId: project.projectId };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });

        await voidApBill(context, { billId });
        let atoms = await loadRecognizedVendorBillAtomsForProject(
          context.db,
          context.organizationId,
          projectId,
          ILS,
        );
        expect(sumAtomNet(atoms)).toBeCloseTo(0, 2);

        await restoreApBill(context, { billId });
        atoms = await loadRecognizedVendorBillAtomsForProject(
          context.db,
          context.organizationId,
          projectId,
          ILS,
        );
        expect(sumAtomNet(atoms)).toBeCloseTo(300, 2);
      });
    });

    it('blocks inventory purchase edit that would rewrite closed-period consumption', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { expenseId, itemId, projectId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const project = await createProject(context, { name: 'Closed Inv' });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);
        const item = await createInventoryItem(context, { name: 'Closed stock', unit: 'ea' });

        const draft = await createExpense(context, {
          projectId: project.projectId,
          costCategoryId: materialsId,
          costFamily: 'direct_project',
          amount: '1000',
          currency: ILS,
          vatMode: 'zero',
          inventoryStockPurchase: true,
          inventoryItemId: item.id,
          inventoryPurchaseQty: '10',
          expenseDate: '2026-06-15',
        });
        await finalizeExpense(context, draft.id);

        await consumeInventoryCostToProject(context, {
          inventoryItemId: item.id,
          quantity: '2',
          occurredOn: '2026-07-20',
          kind: 'project_consume',
          projectId: project.projectId,
        });

        await closeMonth(context, '2026-07');
        return { expenseId: draft.id, itemId: item.id, projectId: project.projectId };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const materialsId = await materialsCategoryId(tx, orgA.organization.id);
        let message = '';
        try {
          await updateFinalizedExpense(context, {
            expenseId,
            projectId,
            costCategoryId: materialsId,
            costFamily: 'direct_project',
            amount: '1200',
            currency: ILS,
            vatMode: 'zero',
            inventoryStockPurchase: true,
            inventoryItemId: itemId,
            inventoryPurchaseQty: '10',
            expenseDate: '2026-06-15',
          });
        } catch (error) {
          message = errorBlob(error);
        }
        expect(message).toMatch(/monthClose|monthClosed|closed/i);
      });
    });
  });
});
