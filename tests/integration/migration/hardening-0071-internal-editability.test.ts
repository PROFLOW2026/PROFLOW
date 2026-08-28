/**
 * Migration 0071 — internal financial editability (open periods).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createApBill,
  editRecognizedApBill,
  getApBillDetail,
  restoreApBill,
  voidApBill,
} from '@/modules/ap';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { updateFinalizedExpense } from '@/modules/expenses/application/update-finalized-expense';
import { loadRecognizedVendorBillAtomsForProject } from '@/modules/financials/data/recognized-vendor-bill-atoms.repository';
import {
  closeMonthClosePeriod,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProject } from '@/modules/projects';
import { createVendor } from '@/modules/vendors';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';
import type { OrgContext } from '@/shared/auth/context';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG_0071 = '0071_internal_financial_editability';
const ILS = 'ILS';

async function closeMonth(context: OrgContext, yearMonth: string) {
  const period = await ensureMonthClosePeriod(context, { yearMonth });
  await markMonthCloseReady(context, { periodId: period.id });
  return closeMonthClosePeriod(context, { periodId: period.id });
}

function sumAtomNet(
  atoms: Awaited<ReturnType<typeof loadRecognizedVendorBillAtomsForProject>>,
): number {
  return atoms.reduce((sum, atom) => sum + Number(atom.amount.amount), 0);
}

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

describe('0071 internal financial editability', () => {
  it('SQL: replaces 0070 immutability guards without dropping integrity', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0071}.sql`), 'utf8');
    expect(raw).toContain('internal_financial_edit_latch_held');
    expect(raw).toContain('ap_bill_restore_latch_held');
    expect(raw).toContain('CREATE OR REPLACE FUNCTION app.expenses_economic_settings_guard');
    expect(raw).toContain('CREATE OR REPLACE FUNCTION app.assert_ap_bill_recognition_gate');
    expect(raw).toContain('CREATE OR REPLACE FUNCTION app.assert_ap_bill_line_immutability_guard');
    expect(raw).toContain('CREATE OR REPLACE FUNCTION app.assert_ap_bill_economic_immutability_guard');
    expect(raw).not.toMatch(/DROP\s+TABLE/i);
    expect(raw).not.toContain('0070_financial_classification_architecture');
  });

  describe('application paths', () => {
    let database: TestDatabase;

    beforeAll(async () => {
      database = await createTestDatabase();
    });

    afterAll(async () => {
      await database?.close();
    });

    beforeEach(async () => {
      await database.reset();
    });

    it('edits finalized expense in open month and recomputes project actual', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { expenseId, projectB, categoryB } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const projectA = await createProject(context, { name: 'Edit A' });
        const projectB = await createProject(context, { name: 'Edit B' });
        const categories = resultRows<{ id: string; key: string }>(
          await tx.execute(sql`
            SELECT id, key FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid
              AND key IN ('materials', 'external_service')
          `),
        );
        const materials = categories.find((row) => row.key === 'materials')!;
        const external = categories.find((row) => row.key === 'external_service')!;

        const draft = await createExpense(context, {
          projectId: projectA.projectId,
          costCategoryId: materials.id,
          costFamily: 'direct_project',
          amount: '1000',
          currency: ILS,
          expenseDate: '2026-08-15',
          description: 'Original',
        });
        await finalizeExpense(context, draft.id);

        return {
          expenseId: draft.id,
          projectB: projectB.projectId,
          categoryB: external.id,
        };
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });

        await updateFinalizedExpense(context, {
          expenseId,
          projectId: projectB,
          costCategoryId: categoryB,
          costFamily: 'direct_project',
          amount: '1500',
          currency: ILS,
          expenseDate: '2026-08-20',
          description: 'Corrected',
        });

        const row = resultRows<{ net_amount: string; project_id: string; cost_category_id: string }>(
          await tx.execute(sql`
            SELECT net_amount::text, project_id::text, cost_category_id::text
            FROM expenses WHERE id = ${expenseId}::uuid
          `),
        )[0]!;
        expect(row.net_amount).toBe('1500.000000');
        expect(row.project_id).toBe(projectB);
        expect(row.cost_category_id).toBe(categoryB);

        const projectNet = resultRows<{ total: string }>(
          await tx.execute(sql`
            SELECT COALESCE(SUM(net_amount), 0)::text AS total
            FROM expenses
            WHERE organization_id = ${orgA.organization.id}::uuid
              AND status = 'finalized'
              AND project_id = ${projectB}::uuid
          `),
        )[0]!;
        expect(Number(projectNet.total)).toBe(1500);
      });
    });

    it('edits recognized AP bill in open month with NET/TAX/GROSS conservation', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, projectB, serviceId, vendorId } = await database.asUser(
        userA.id,
        async (tx) => {
          const context = await resolveOrgContext(tx, {
            userId: userA.id,
            organizationId: orgA.organization.id,
            locale: 'en',
          });
          const vendor = await createVendor(context, { name: 'Edit Vendor' });
          const projectA = await createProject(context, { name: 'AP A' });
          const projectB = await createProject(context, { name: 'AP B' });
          const categories = resultRows<{ id: string; key: string }>(
            await tx.execute(sql`
              SELECT id, key FROM cost_categories
              WHERE organization_id = ${orgA.organization.id}::uuid
                AND key IN ('materials', 'external_service')
            `),
          );
          const materialsId = categories.find((row) => row.key === 'materials')!.id;
          const serviceId = categories.find((row) => row.key === 'external_service')!.id;

          const bill = await createApBill(context, {
            vendorId: vendor.id,
            projectId: projectA.projectId,
            currency: ILS,
            totalAmount: '100',
            netAmount: '100',
            taxAmount: '0',
            billDate: '2026-08-01',
            lines: [
              {
                description: 'Line 1',
                quantity: '1',
                unitAmount: '100',
                lineTotal: '100',
                currency: ILS,
                costCategoryId: materialsId,
                costFamily: 'direct_project',
              },
            ],
          });

          return {
            billId: bill.id,
            projectB: projectB.projectId,
            serviceId,
            vendorId: vendor.id,
          };
        },
      );

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });

        const detail = await getApBillDetail(context, billId);
        const lines = detail!.lines;

        await editRecognizedApBill(context, {
          billId,
          vendorId,
          projectId: projectB,
          currency: ILS,
          totalAmount: '200',
          netAmount: '200',
          taxAmount: '0',
          billDate: '2026-08-05',
          lines: [
            {
              lineId: lines[0]!.id,
              description: 'Line corrected',
              quantity: '1',
              unitAmount: '200',
              lineTotal: '200',
              currency: ILS,
              costCategoryId: serviceId,
              costFamily: 'direct_project',
              economicTargetType: 'project',
              projectId: projectB,
            },
          ],
        });

        const bill = resultRows<{
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
        expect(bill.net_amount).toBe('200.000000');
        expect(bill.sum_net).toBe(bill.net_amount);
        expect(bill.sum_tax).toBe(bill.tax_amount);
        expect(bill.sum_gross).toBe(bill.gross_amount);

        const atoms = await loadRecognizedVendorBillAtomsForProject(
          context.db,
          context.organizationId,
          projectB,
          ILS,
        );
        expect(sumAtomNet(atoms)).toBeCloseTo(200, 2);
      });
    });

    it('void then restore AP bill in open month without duplicate actual', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const { billId, projectId } = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Restore Vendor' });
        const project = await createProject(context, { name: 'Restore Project' });
        const category = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!;

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
              costCategoryId: category.id,
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

        const status = resultRows<{ status: string }>(
          await tx.execute(sql`SELECT status FROM ap_bills WHERE id = ${billId}::uuid`),
        )[0]!;
        expect(status.status).toBe('open');
      });
    });

    it('blocks finalized expense edit in closed month', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const expenseId = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const project = await createProject(context, { name: 'Closed Expense' });
        const category = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!;
        const draft = await createExpense(context, {
          projectId: project.projectId,
          costCategoryId: category.id,
          costFamily: 'direct_project',
          amount: '500',
          currency: ILS,
          expenseDate: '2026-08-01',
        });
        await finalizeExpense(context, draft.id);
        await closeMonth(context, '2026-08');
        return draft.id;
      });

      await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        let message = '';
        const categoryRows = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid AND key = 'materials' LIMIT 1
          `),
        );
        const categoryId = categoryRows[0]!.id;
        try {
          await updateFinalizedExpense(context, {
            expenseId,
            projectId: null,
            costCategoryId: categoryId,
            costFamily: 'direct_project',
            amount: '600',
            currency: ILS,
            expenseDate: '2026-08-01',
          });
        } catch (error) {
          message = errorBlob(error);
        }
        expect(message).toMatch(/monthClose|expense_edit_closed_month|closed/i);
      });
    });

    it('blocks naked SQL edit on recognized AP without trusted latch', async () => {
      const { orgA, userA } = await provisionTwoTenants(database);

      const billId = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Guard Vendor' });
        const project = await createProject(context, { name: 'Guard Project' });
        const category = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${orgA.organization.id}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!;
        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: ILS,
          totalAmount: '80',
          netAmount: '80',
          taxAmount: '0',
          billDate: '2026-08-12',
          lines: [
            {
              description: 'Guarded',
              quantity: '1',
              unitAmount: '80',
              lineTotal: '80',
              currency: ILS,
              costCategoryId: category.id,
              costFamily: 'direct_project',
            },
          ],
        });
        return bill.id;
      });

      let message = '';
      await database.asUser(userA.id, async (tx) => {
        try {
          await tx.execute(sql`
            UPDATE ap_bills SET net_amount = 90 WHERE id = ${billId}::uuid
          `);
        } catch (error) {
          message = errorBlob(error);
        }
      });
      expect(message).toMatch(/immutable|23514|restrict/i);
    });
  });
});
