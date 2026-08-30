/**
 * 0072 recurring auto-finalize run guard — targeted DB + application scenarios.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expenses } from '@drizzle/schema';
import { createApBill } from '@/modules/ap';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import {
  closeMonthClosePeriod,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import { createProject } from '@/modules/projects';
import { createVendor } from '@/modules/vendors';
import {
  createRecurringDraft,
  generateRecurringDraftHistory,
  getRecurringDraftDetail,
} from '@/modules/recurring-drafts';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import {
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { createOrganization } from '@/modules/tenancy';
import { createClient } from '@/modules/clients';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG_0072 = '0072_recurring_auto_finalize_run_guard';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function closeMonth(context: OrgContext, yearMonth: string) {
  const period = await ensureMonthClosePeriod(context, { yearMonth });
  await markMonthCloseReady(context, { periodId: period.id });
  return closeMonthClosePeriod(context, { periodId: period.id });
}

async function insuranceCategoryId(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  organizationId: string,
): Promise<string> {
  return resultRows<{ id: string }>(
    await tx.execute(sql`
      SELECT id FROM cost_categories
      WHERE organization_id = ${organizationId}::uuid AND key = 'insurance' LIMIT 1
    `),
  )[0]!.id;
}

describe('0072 recurring auto-finalize run guard', () => {
  it('SQL: replaces guard with auto_finalize_expense-aware condition', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0072}.sql`), 'utf8');
    expect(raw).toContain('auto_finalize_expense');
    expect(raw).toContain('app.recurring_financial_draft_runs_guard');
    expect(raw).toContain("entity_status = 'finalized'");
    expect(raw).not.toContain('DROP TABLE');
  });

  it('0072 function replacement is idempotent on an already-migrated database', async () => {
    const database = await createTestDatabase();
    try {
      const raw = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0072}.sql`), 'utf8');
      await database.asService(async (db) => {
        for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
          await db.execute(sql.raw(statement));
        }
      });
    } finally {
      await database.close();
    }
  });

  describe('application paths', () => {
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

    it('retro Jan–Aug creates 8 finalized expenses with 8 run links and no duplicates on retry', async () => {
      const owner = await createTestUser(database, 'owner-auto-rec@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Auto Recurring Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const { draftId, categoryId } = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        const categoryId = await insuranceCategoryId(tx, organizationId);
        const created = await createRecurringDraft(context, {
          draftKind: 'expense',
          title: 'ביטוח',
          frequency: 'monthly',
          intervalCount: 1,
          nextRunDate: '2026-01-01',
          endDate: null,
          autoFinalizeExpense: true,
          managerialCostKind: 'general_business',
          payload: {
            amount: '800',
            currency: 'ILS',
            vatMode: 'zero',
            costCategoryId: categoryId,
            costFamily: 'business_overhead',
          },
        });
        return { draftId: created.draft.id, categoryId };
      });

      const first = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        return generateRecurringDraftHistory(context, draftId, {
          fromYearMonth: '2026-01',
          toYearMonth: '2026-08',
        });
      });

      expect(first.summary.finalized).toBe(8);
      expect(first.summary.blockedClosed).toBe(0);
      expect(first.generated).toHaveLength(8);

      const detail = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        return getRecurringDraftDetail(context, draftId);
      });

      expect(detail.runs).toHaveLength(8);
      const occurrenceMonths = detail.runs.map((run) => run.occurrenceYearMonth).sort();
      expect(occurrenceMonths).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
      ]);
      expect(new Set(occurrenceMonths).size).toBe(8);

      const expenseRows = await database.asService(async (db) =>
        db
          .select({
            id: expenses.id,
            status: expenses.status,
            netAmount: expenses.netAmount,
            taxAmount: expenses.taxAmount,
            grossAmount: expenses.grossAmount,
            vatMode: expenses.vatMode,
            costCategoryId: expenses.costCategoryId,
          })
          .from(expenses)
          .where(sql`${expenses.organizationId} = ${organizationId}::uuid`),
      );

      expect(expenseRows).toHaveLength(8);
      for (const row of expenseRows) {
        expect(row.status).toBe('finalized');
        expect(Number(row.netAmount)).toBe(800);
        expect(Number(row.taxAmount)).toBe(0);
        expect(Number(row.grossAmount)).toBe(800);
        expect(row.vatMode).toBe('zero');
        expect(row.costCategoryId).toBe(categoryId);
      }

      const retry = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        return generateRecurringDraftHistory(context, draftId, {
          fromYearMonth: '2026-01',
          toYearMonth: '2026-08',
        });
      });

      expect(retry.generated).toHaveLength(0);
      expect(retry.skippedExistingMonths).toHaveLength(8);
      expect(retry.summary.skippedExisting).toBe(8);

      const detailAfterRetry = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        return getRecurringDraftDetail(context, draftId);
      });
      expect(detailAfterRetry.runs).toHaveLength(8);
    });

    it('review-mode recurring expense keeps draft-only protection at run insert', async () => {
      const owner = await createTestUser(database, 'owner-review-rec@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Review Recurring Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const categoryId = await insuranceCategoryId(tx, organizationId);
        const created = await createRecurringDraft(context, {
          draftKind: 'expense',
          title: 'Manual review',
          frequency: 'monthly',
          intervalCount: 1,
          nextRunDate: '2026-05-01',
          endDate: null,
          autoFinalizeExpense: false,
          managerialCostKind: 'general_business',
          payload: {
            amount: '500',
            currency: 'ILS',
            vatMode: 'zero',
            costCategoryId: categoryId,
            costFamily: 'business_overhead',
          },
        });

        const expense = await createExpense(
          context,
          expenseInputFromPayloadCompat({
            amount: '500',
            currency: 'ILS',
            vatMode: 'zero',
            costCategoryId: categoryId,
            costFamily: 'business_overhead',
            expenseDate: '2026-05-01',
          }),
        );
        await finalizeExpense(context, expense.id);

        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, occurrence_year_month,
              generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${created.draft.id}::uuid, '2026-05-01', '2026-05',
              'expense', ${expense.id}::uuid
            )
          `),
        ).rejects.toSatisfy((err) => /generated entity must remain draft/i.test(errorBlob(err)));
      });
    });

    it('vendor bill and billing record protections remain draft-only', async () => {
      const owner = await createTestUser(database, 'owner-other-rec@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Other Recurring Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const refs = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Vendor' });
        const client = await createClient(context, { name: 'Client' });
        const project = await createProject(context, {
          name: 'Project',
          clientId: client.id,
        });
        const materialsId = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM cost_categories
            WHERE organization_id = ${organizationId}::uuid AND key = 'materials' LIMIT 1
          `),
        )[0]!.id;

        const bill = await createApBill(context, {
          vendorId: vendor.id,
          projectId: project.projectId,
          currency: 'ILS',
          totalAmount: '1000',
          netAmount: '1000',
          taxAmount: '0',
          billDate: '2026-06-01',
          lines: [
            {
              description: 'Line',
              quantity: '1',
              unitAmount: '1000',
              lineTotal: '1000',
              currency: 'ILS',
              costCategoryId: materialsId,
              costFamily: 'direct_project',
            },
          ],
        });

        const billDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'vendor_bill', 'Bill template', 'monthly', 1,
              '2026-06-01', '{"totalAmount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        )[0]!.id;

        const billingDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'billing_record', 'Billing template', 'monthly', 1,
              '2026-06-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        )[0]!.id;

        return { billDraft, billingDraft, openBillId: bill.id, projectId: project.projectId };
      });

      await database.asService(async (db) => {
        await db.execute(sql`
          UPDATE ap_bills SET status = 'open' WHERE id = ${refs.openBillId}::uuid
        `);
        await db.execute(sql`
          INSERT INTO billing_records (
            organization_id, project_id, issue_date, status,
            subtotal_amount, total_amount, currency
          ) VALUES (
            ${organizationId}::uuid, ${refs.projectId}::uuid, '2026-06-01', 'finalized',
            1000, 1000, 'ILS'
          )
        `);
      });

      const finalizedBillingId = await database.asService(async (db) =>
        resultRows<{ id: string }>(
          await db.execute(sql`
            SELECT id FROM billing_records
            WHERE organization_id = ${organizationId}::uuid
              AND project_id = ${refs.projectId}::uuid
              AND issue_date = '2026-06-01'
            LIMIT 1
          `),
        )[0]!.id,
      );

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, occurrence_year_month,
              generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${refs.billDraft}::uuid, '2026-06-01', '2026-06',
              'vendor_bill', ${refs.openBillId}::uuid
            )
          `),
        ).rejects.toSatisfy((err) => /generated entity must remain draft/i.test(errorBlob(err)));

        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, occurrence_year_month,
              generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${refs.billingDraft}::uuid, '2026-06-01', '2026-06',
              'billing_record', ${finalizedBillingId}::uuid
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('closed month stays protected: draft expense linked, not finalized', async () => {
      const owner = await createTestUser(database, 'owner-closed-rec@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Closed Month Recurring Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const draftId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        await closeMonth(context, '2026-03');
        const categoryId = await insuranceCategoryId(tx, organizationId);
        const created = await createRecurringDraft(context, {
          draftKind: 'expense',
          title: 'ביטוח',
          frequency: 'monthly',
          intervalCount: 1,
          nextRunDate: '2026-03-01',
          endDate: null,
          autoFinalizeExpense: true,
          managerialCostKind: 'general_business',
          payload: {
            amount: '800',
            currency: 'ILS',
            vatMode: 'zero',
            costCategoryId: categoryId,
            costFamily: 'business_overhead',
          },
        });
        return created.draft.id;
      });

      const result = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        return generateRecurringDraftHistory(context, draftId, {
          fromYearMonth: '2026-03',
          toYearMonth: '2026-03',
        });
      });

      expect(result.summary.finalized).toBe(0);
      expect(result.summary.blockedClosed).toBe(1);
      expect(result.generated).toHaveLength(1);
      expect(result.generated[0]?.outcome).toBe('blocked_closed');

      const detail = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'he-IL',
        });
        return getRecurringDraftDetail(context, draftId);
      });
      expect(detail.runs).toHaveLength(1);

      const linked = await database.asService(async (db) =>
        db
          .select({ status: expenses.status })
          .from(expenses)
          .where(sql`${expenses.id} = ${detail.runs[0]!.generatedEntityId}::uuid`),
      );
      expect(linked[0]?.status).toBe('draft');
    });
  });
});

function expenseInputFromPayloadCompat(input: {
  amount: string;
  currency: string;
  vatMode: 'zero';
  costCategoryId: string;
  costFamily: 'business_overhead';
  expenseDate: string;
}) {
  return {
    amount: input.amount,
    currency: input.currency,
    expenseDate: input.expenseDate,
    vatMode: input.vatMode,
    costCategoryId: input.costCategoryId,
    costFamily: input.costFamily,
    description: null,
    supplierName: null,
    vendorId: null,
    projectId: null,
    notes: null,
    paymentMethod: null,
  };
}
