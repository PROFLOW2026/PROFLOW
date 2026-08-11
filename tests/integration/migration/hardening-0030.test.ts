import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { createClient } from '@/modules/clients';
import { createProject } from '@/modules/projects';
import { createVendor } from '@/modules/vendors';
import { assignRole } from '@/modules/rbac';
import { organizationMemberships, rolePermissions, roles } from '@drizzle/schema';
import {
  applySqlMigrations,
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

function errorBlob(error: unknown): string {
  if (!error) return '';
  if (typeof error !== 'object') return String(error);
  const e = error as {
    message?: string;
    cause?: unknown;
    detail?: string;
    code?: string;
    hint?: string;
    error?: unknown;
  };
  return [e.message, e.detail, e.code, e.hint, errorBlob(e.cause), errorBlob(e.error)]
    .filter(Boolean)
    .join('\n');
}

describe('migration hardening 0030', () => {
  describe('clean start and 0029→0030', () => {
    it('clean-starts through 0030', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client);
        const tables = await client.query(
          `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN ('retention_releases','recurring_financial_draft_runs','month_close_adjustments')`,
        );
        expect(tables.rows.length).toBe(3);
        const cols = await client.query(
          `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ap_bills'
           AND column_name IN ('retention_amount','retention_held_remaining')`,
        );
        expect(cols.rows.length).toBe(2);
      });
    });

    it('upgrades 0029 → 0030', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client, '0029_next_gen_integration_hardening');
        const before = await client.query(
          `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ap_bills' AND column_name = 'retention_amount'`,
        );
        expect(before.rows.length).toBe(0);
        const raw = await readFile(
          path.join(MIGRATIONS_DIR, '0030_gap_closure_corrections_retention_recurring.sql'),
          'utf8',
        );
        for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
          await client.exec(statement);
        }
        const after = await client.query(
          `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'retention_releases'`,
        );
        expect(after.rows.length).toBe(1);
        const moneyCols = await client.query(
          `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'month_close_adjustments'
           AND column_name IN ('amount','currency','effect_side','project_id','supersedes_adjustment_id')`,
        );
        expect(moneyCols.rows.length).toBe(5);
      });
    });
  });

  describe('retention / corrections / recurring runs', () => {
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

    it('decrements held remaining on release and blocks over-release and mutation', async () => {
      const owner = await createTestUser(database, 'owner-ret@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const { billId, currency } = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Held Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100000,
              10000, 10000, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return { billId: inserted[0]!.id, currency: 'ILS' };
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO retention_releases (
            organization_id, side, source_type, source_id, amount, currency,
            released_on, created_by_user_id
          ) VALUES (
            ${organizationId}::uuid, 'ap', 'vendor_bill', ${billId}::uuid, 4000, ${currency},
            '2026-08-11', ${owner.id}::uuid
          )
        `);
      });

      const held = await database.asUser(owner.id, async (tx) =>
        resultRows<{ retention_held_remaining: string }>(
          await tx.execute(sql`
            SELECT retention_held_remaining FROM ap_bills WHERE id = ${billId}::uuid
          `),
        ),
      );
      expect(Number(held[0]!.retention_held_remaining)).toBe(6000);

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO retention_releases (
              organization_id, side, source_type, source_id, amount, currency,
              released_on, created_by_user_id
            ) VALUES (
              ${organizationId}::uuid, 'ap', 'vendor_bill', ${billId}::uuid, 7000, 'ILS',
              CURRENT_DATE, ${owner.id}::uuid
            )
          `),
        ).rejects.toSatisfy((error) => /exceeds held|Failed query/i.test(errorBlob(error)));
      });

      const releaseId = await database.asUser(owner.id, async (tx) => {
        const rows = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM retention_releases WHERE source_id = ${billId}::uuid
          `),
        );
        return rows[0]!.id;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE retention_releases SET amount = 1 WHERE id = ${releaseId}::uuid
          `),
        ).rejects.toSatisfy((error) => /immutable|restrict/i.test(errorBlob(error)));
        await expect(
          tx.execute(sql`DELETE FROM retention_releases WHERE id = ${releaseId}::uuid`),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            UPDATE ap_bills SET retention_held_remaining = 0 WHERE id = ${billId}::uuid
          `),
        ).rejects.toThrow();
      });
    });

    it('rejects incomplete economic month-close rows and accepts complete cost corrections', async () => {
      const owner = await createTestUser(database, 'owner-mc@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Close Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const { periodId, projectId } = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const client = await createClient(context, { name: 'Close Client' });
        const project = await createProject(context, {
          name: 'Close Project',
          clientId: client.id,
        });
        const period = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_periods (organization_id, year_month, status)
            VALUES (${organizationId}::uuid, '2026-07', 'open')
            RETURNING id
          `),
        );
        const periodId = period[0]!.id;
        await tx.execute(sql`
          UPDATE month_close_periods SET status = 'ready' WHERE id = ${periodId}::uuid
        `);
        await tx.execute(sql`
          UPDATE month_close_periods SET status = 'closed' WHERE id = ${periodId}::uuid
        `);
        return { periodId, projectId: project.projectId };
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, adjustment_type, reason, amount, effect_side
            ) VALUES (
              ${organizationId}::uuid, ${periodId}::uuid, 'correction', 'incomplete', 50, 'cost'
            )
          `),
        ).rejects.toThrow();
      });

      const inserted = await database.asUser(owner.id, async (tx) =>
        resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, adjustment_type, reason,
              amount, currency, effect_side, project_id
            ) VALUES (
              ${organizationId}::uuid, ${periodId}::uuid, 'correction', 'missed cost',
              50, 'ILS', 'cost', ${projectId}::uuid
            )
            RETURNING id
          `),
        ),
      );
      expect(inserted[0]?.id).toBeTruthy();

      const supersede = await database.asUser(owner.id, async (tx) =>
        resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, adjustment_type, reason,
              amount, currency, effect_side, project_id, supersedes_adjustment_id
            ) VALUES (
              ${organizationId}::uuid, ${periodId}::uuid, 'supersede', 'replace missed cost',
              40, 'ILS', 'cost', ${projectId}::uuid, ${inserted[0]!.id}::uuid
            )
            RETURNING id
          `),
        ),
      );
      expect(supersede[0]?.id).toBeTruthy();

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, adjustment_type, reason,
              amount, currency, effect_side, project_id, supersedes_adjustment_id
            ) VALUES (
              ${organizationId}::uuid, ${periodId}::uuid, 'supersede', 'duplicate replace',
              10, 'ILS', 'cost', ${projectId}::uuid, ${inserted[0]!.id}::uuid
            )
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE month_close_adjustments SET amount = 1 WHERE id = ${inserted[0]!.id}::uuid
          `),
        ).rejects.toSatisfy((error) => /immutable/i.test(errorBlob(error)));
      });
    });

    it('rejects duplicate recurring draft runs for the same date', async () => {
      const owner = await createTestUser(database, 'owner-rec@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Recurring Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const { draftId, expenseId } = await database.asUser(owner.id, async (tx) => {
        const drafts = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'expense', 'Rent', 'monthly', 1,
              '2026-09-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const expenses = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, net_amount, gross_amount, currency, status
            ) VALUES (
              ${organizationId}::uuid, '2026-09-01', 1000, 1000, 'ILS', 'draft'
            )
            RETURNING id
          `),
        );
        return { draftId: drafts[0]!.id, expenseId: expenses[0]!.id };
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${draftId}::uuid, '2026-09-01', 'expense', gen_random_uuid()
            )
          `),
        ).rejects.toSatisfy((error) => /generated entity must exist/i.test(errorBlob(error)));
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO recurring_financial_draft_runs (
            organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
          ) VALUES (
            ${organizationId}::uuid, ${draftId}::uuid, '2026-09-01', 'expense', ${expenseId}::uuid
          )
        `);
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${draftId}::uuid, '2026-09-01', 'expense', gen_random_uuid()
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('rejects posted/finalized retention when held remaining ≠ retention amount', async () => {
      const owner = await createTestUser(database, 'owner-ret-post@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Post Org',
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
        const vendor = await createVendor(context, { name: 'Mismatch Vendor' });
        const client = await createClient(context, { name: 'Mismatch Client' });
        const project = await createProject(context, {
          name: 'Mismatch Project',
          clientId: client.id,
        });
        const draft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'draft', 'ILS', 100000,
              10000, 0, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return { vendorId: vendor.id, projectId: project.projectId, draftId: draft[0]!.id };
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${refs.vendorId}::uuid, 'open', 'ILS', 100000,
              10000, 0, '2026-08-01'
            )
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE ap_bills SET status = 'open' WHERE id = ${refs.draftId}::uuid
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO billing_records (
              organization_id, project_id, issue_date, status,
              subtotal_amount, total_amount, currency,
              retention_amount, retention_held_remaining
            ) VALUES (
              ${organizationId}::uuid, ${refs.projectId}::uuid, '2026-08-01', 'finalized',
              100000, 100000, 'ILS', 15000, 0
            )
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO billing_records (
              organization_id, project_id, issue_date, status, kind,
              subtotal_amount, total_amount, currency,
              retention_amount, retention_held_remaining
            ) VALUES (
              ${organizationId}::uuid, ${refs.projectId}::uuid, '2026-08-01', 'finalized', 'credit_note',
              5000, 5000, 'ILS', 1000, 1000
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('freezes retention_amount after post and ignores GUC bypass of held remaining', async () => {
      const owner = await createTestUser(database, 'owner-ret-freeze@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Freeze Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const { billId, billingId } = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Freeze Vendor' });
        const client = await createClient(context, { name: 'Freeze Client' });
        const project = await createProject(context, {
          name: 'Freeze Project',
          clientId: client.id,
        });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100000,
              10000, 10000, '2026-08-01'
            )
            RETURNING id
          `),
        );
        const billing = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO billing_records (
              organization_id, project_id, issue_date, status,
              subtotal_amount, total_amount, currency,
              retention_amount, retention_held_remaining
            ) VALUES (
              ${organizationId}::uuid, ${project.projectId}::uuid, '2026-08-01', 'finalized',
              100000, 100000, 'ILS', 8000, 8000
            )
            RETURNING id
          `),
        );
        return { billId: inserted[0]!.id, billingId: billing[0]!.id };
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE ap_bills SET retention_amount = 5000 WHERE id = ${billId}::uuid
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            UPDATE billing_records SET retention_amount = 1000 WHERE id = ${billingId}::uuid
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`SELECT set_config('app.retention_release_write', '1', true)`);
        await expect(
          tx.execute(sql`
            UPDATE ap_bills SET retention_held_remaining = 0 WHERE id = ${billId}::uuid
          `),
        ).rejects.toThrow();
      });

      await expect(
        database.asService(async (db) => {
          await db.execute(sql`
            UPDATE ap_bills SET retention_held_remaining = 0 WHERE id = ${billId}::uuid
          `);
        }),
      ).rejects.toThrow();
    });

    it('rejects nested-trigger and caller-function bypass of held remaining', async () => {
      const owner = await createTestUser(database, 'owner-ret-nested@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Nested Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const billId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Nested Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100000,
              10000, 10000, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asService(async (db) => {
        await db.execute(
          sql.raw(`
            CREATE FUNCTION pg_temp.evil_reduce_held() RETURNS trigger
            LANGUAGE plpgsql AS $f$
            BEGIN
              UPDATE public.ap_bills
                 SET retention_held_remaining = 0
               WHERE id = '${billId}'::uuid;
              RETURN NEW;
            END
            $f$
          `),
        );
        await db.execute(sql`CREATE TEMP TABLE nested_hijack (x int)`);
        await db.execute(sql`
          CREATE TRIGGER nested_hijack_t
            BEFORE INSERT ON nested_hijack
            FOR EACH ROW EXECUTE FUNCTION pg_temp.evil_reduce_held()
        `);
        await expect(db.execute(sql`INSERT INTO nested_hijack VALUES (1)`)).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        const rows = resultRows<{ retention_held_remaining: string }>(
          await tx.execute(sql`
            SELECT retention_held_remaining::text
              FROM ap_bills WHERE id = ${billId}::uuid
          `),
        );
        expect(Number(rows[0]?.retention_held_remaining)).toBe(10000);
      });
    });

    it('allows voiding a draft bill with captured retention and held remaining 0', async () => {
      const owner = await createTestUser(database, 'owner-ret-void-draft@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Void Draft Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const billId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Void Draft Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'draft', 'ILS', 100000,
              10000, 0, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          UPDATE ap_bills SET status = 'void' WHERE id = ${billId}::uuid
        `);
        const rows = resultRows<{ status: string }>(
          await tx.execute(sql`SELECT status FROM ap_bills WHERE id = ${billId}::uuid`),
        );
        expect(rows[0]?.status).toBe('void');
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE ap_bills SET status = 'open' WHERE id = ${billId}::uuid
          `),
        ).rejects.toThrow();
      });
    });

    it('rejects reverting a posted bill to draft to unfreeze retention', async () => {
      const owner = await createTestUser(database, 'owner-ret-unfreeze@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Unfreeze Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const billId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Unfreeze Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100000,
              10000, 10000, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE ap_bills SET status = 'draft' WHERE id = ${billId}::uuid
          `),
        ).rejects.toThrow();
      });
    });

    it('rejects temp-table hijack of the retention release DEFINER function', async () => {
      const owner = await createTestUser(database, 'owner-ret-hijack@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Hijack Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const billId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Hijack Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100000,
              10000, 10000, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          CREATE TEMP TABLE hijack (
            organization_id uuid,
            side text,
            source_type text,
            source_id uuid,
            amount numeric,
            currency char(3),
            released_on date,
            created_by_user_id uuid
          )
        `);
        await expect(
          tx.execute(sql`
            CREATE TRIGGER hijack_t BEFORE INSERT ON hijack
            FOR EACH ROW EXECUTE FUNCTION app.retention_releases_guard()
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        const rows = resultRows<{ retention_held_remaining: string }>(
          await tx.execute(sql`
            SELECT retention_held_remaining::text
              FROM ap_bills WHERE id = ${billId}::uuid
          `),
        );
        expect(Number(rows[0]?.retention_held_remaining)).toBe(10000);
      });
    });

    it('rejects future released_on and applies backdated releases immediately', async () => {
      const owner = await createTestUser(database, 'owner-ret-date@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Retention Date Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const billId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Date Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              retention_amount, retention_held_remaining, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 100000,
              10000, 10000, '2026-08-01'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO retention_releases (
              organization_id, side, source_type, source_id, amount, currency,
              released_on, created_by_user_id
            ) VALUES (
              ${organizationId}::uuid, 'ap', 'vendor_bill', ${billId}::uuid, 1000, 'ILS',
              (CURRENT_DATE + 7), ${owner.id}::uuid
            )
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO retention_releases (
            organization_id, side, source_type, source_id, amount, currency,
            released_on, created_by_user_id
          ) VALUES (
            ${organizationId}::uuid, 'ap', 'vendor_bill', ${billId}::uuid, 2500, 'ILS',
            '2020-01-15', ${owner.id}::uuid
          )
        `);
      });

      const held = await database.asUser(owner.id, async (tx) =>
        resultRows<{ retention_held_remaining: string }>(
          await tx.execute(sql`
            SELECT retention_held_remaining FROM ap_bills WHERE id = ${billId}::uuid
          `),
        ),
      );
      expect(Number(held[0]!.retention_held_remaining)).toBe(7500);
    });

    it('rejects invalid month-close supersede chains', async () => {
      const owner = await createTestUser(database, 'owner-mc-chain@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Close Chain Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const ids = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const client = await createClient(context, { name: 'Chain Client' });
        const projectA = await createProject(context, {
          name: 'Chain A',
          clientId: client.id,
        });
        const projectB = await createProject(context, {
          name: 'Chain B',
          clientId: client.id,
        });
        const period = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_periods (organization_id, year_month, status)
            VALUES (${organizationId}::uuid, '2026-06', 'open')
            RETURNING id
          `),
        );
        const periodId = period[0]!.id;
        await tx.execute(sql`UPDATE month_close_periods SET status = 'ready' WHERE id = ${periodId}::uuid`);
        await tx.execute(sql`UPDATE month_close_periods SET status = 'closed' WHERE id = ${periodId}::uuid`);

        const economic = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, adjustment_type, reason,
              amount, currency, effect_side, project_id
            ) VALUES (
              ${organizationId}::uuid, ${periodId}::uuid, 'correction', 'missed cost',
              50, 'ILS', 'cost', ${projectA.projectId}::uuid
            )
            RETURNING id
          `),
        );
        const audit = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, adjustment_type, reason
            )             VALUES (
              ${organizationId}::uuid, ${periodId}::uuid, 'adjustment', 'audit only'
            )
            RETURNING id
          `),
        );
        return {
          periodId,
          projectA: projectA.projectId,
          projectB: projectB.projectId,
          economicId: economic[0]!.id,
          auditId: audit[0]!.id,
        };
      });

      const rejectSupersede = async (fragment: ReturnType<typeof sql>) => {
        await database.asUser(owner.id, async (tx) => {
          await expect(tx.execute(fragment)).rejects.toThrow();
        });
      };

      const selfId = '01900000-0000-7000-8000-00000000aa01';
      await rejectSupersede(sql`
        INSERT INTO month_close_adjustments (
          id, organization_id, period_id, adjustment_type, reason,
          amount, currency, effect_side, project_id, supersedes_adjustment_id
        ) VALUES (
          ${selfId}::uuid, ${organizationId}::uuid, ${ids.periodId}::uuid, 'supersede', 'self',
          10, 'ILS', 'cost', ${ids.projectA}::uuid, ${selfId}::uuid
        )
      `);
      await rejectSupersede(sql`
        INSERT INTO month_close_adjustments (
          organization_id, period_id, adjustment_type, reason,
          amount, currency, effect_side, project_id, supersedes_adjustment_id
        ) VALUES (
          ${organizationId}::uuid, ${ids.periodId}::uuid, 'supersede', 'cross project',
          10, 'ILS', 'cost', ${ids.projectB}::uuid, ${ids.economicId}::uuid
        )
      `);
      await rejectSupersede(sql`
        INSERT INTO month_close_adjustments (
          organization_id, period_id, adjustment_type, reason,
          amount, currency, effect_side, project_id, supersedes_adjustment_id
        ) VALUES (
          ${organizationId}::uuid, ${ids.periodId}::uuid, 'supersede', 'wrong side',
          10, 'ILS', 'revenue', ${ids.projectA}::uuid, ${ids.economicId}::uuid
        )
      `);
      await rejectSupersede(sql`
        INSERT INTO month_close_adjustments (
          organization_id, period_id, adjustment_type, reason,
          amount, currency, effect_side, project_id, supersedes_adjustment_id
        ) VALUES (
          ${organizationId}::uuid, ${ids.periodId}::uuid, 'supersede', 'wrong currency',
          10, 'USD', 'cost', ${ids.projectA}::uuid, ${ids.economicId}::uuid
        )
      `);
      await rejectSupersede(sql`
        INSERT INTO month_close_adjustments (
          organization_id, period_id, adjustment_type, reason,
          amount, currency, effect_side, project_id, supersedes_adjustment_id
        ) VALUES (
          ${organizationId}::uuid, ${ids.periodId}::uuid, 'supersede', 'audit target',
          10, 'ILS', 'cost', ${ids.projectA}::uuid, ${ids.auditId}::uuid
        )
      `);
      await rejectSupersede(sql`
        INSERT INTO month_close_adjustments (
          organization_id, period_id, adjustment_type, reason,
          supersedes_adjustment_id
        ) VALUES (
          ${organizationId}::uuid, ${ids.periodId}::uuid, 'supersede', 'incomplete supersede',
          ${ids.economicId}::uuid
        )
      `);
    });

    it('rejects recurring runs that point at posted or finalized entities', async () => {
      const owner = await createTestUser(database, 'owner-rec-draft@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Recurring Draft-Only Org',
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
        const vendor = await createVendor(context, { name: 'Posted Vendor' });
        const client = await createClient(context, { name: 'Posted Client' });
        const project = await createProject(context, {
          name: 'Posted Project',
          clientId: client.id,
        });

        const expenseDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'expense', 'Posted expense', 'monthly', 1,
              '2026-09-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const finalizedExpense = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, net_amount, gross_amount, currency, status
            ) VALUES (
              ${organizationId}::uuid, '2026-09-01', 1000, 1000, 'ILS', 'finalized'
            )
            RETURNING id
          `),
        );
        const billDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'vendor_bill', 'Posted bill', 'monthly', 1,
              '2026-09-01', '{"totalAmount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const openBill = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount, bill_date
            ) VALUES (
              ${organizationId}::uuid, ${vendor.id}::uuid, 'open', 'ILS', 1000, '2026-09-01'
            )
            RETURNING id
          `),
        );
        const billingDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'billing_record', 'Posted billing', 'monthly', 1,
              '2026-09-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const finalizedBilling = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO billing_records (
              organization_id, project_id, issue_date, status,
              subtotal_amount, total_amount, currency
            ) VALUES (
              ${organizationId}::uuid, ${project.projectId}::uuid, '2026-09-01', 'finalized',
              1000, 1000, 'ILS'
            )
            RETURNING id
          `),
        );
        return {
          expenseDraftId: expenseDraft[0]!.id,
          finalizedExpenseId: finalizedExpense[0]!.id,
          billDraftId: billDraft[0]!.id,
          openBillId: openBill[0]!.id,
          billingDraftId: billingDraft[0]!.id,
          finalizedBillingId: finalizedBilling[0]!.id,
        };
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${refs.expenseDraftId}::uuid, '2026-09-01',
              'expense', ${refs.finalizedExpenseId}::uuid
            )
          `),
        ).rejects.toThrow();
      });
      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${refs.billDraftId}::uuid, '2026-09-01',
              'vendor_bill', ${refs.openBillId}::uuid
            )
          `),
        ).rejects.toThrow();
      });
      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${refs.billingDraftId}::uuid, '2026-09-01',
              'billing_record', ${refs.finalizedBillingId}::uuid
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('lets a create-only custom role generate a recurring expense draft without expenses.read', async () => {
      const owner = await createTestUser(database, 'owner-rec-custom@example.test');
      const generator = await createTestUser(database, 'generator-rec-custom@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Custom Role Recurring Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const { draftId, expenseId } = await database.asUser(owner.id, async (tx) => {
        const drafts = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'expense', 'Custom rent', 'monthly', 1,
              '2026-09-02', '{"amount":"250"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const expenses = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO expenses (
              organization_id, expense_date, net_amount, gross_amount, currency, status
            ) VALUES (
              ${organizationId}::uuid, '2026-09-02', 250, 250, 'ILS', 'draft'
            )
            RETURNING id
          `),
        );
        return { draftId: drafts[0]!.id, expenseId: expenses[0]!.id };
      });

      await database.asService(async (db) => {
        const [role] = await db
          .insert(roles)
          .values({
            organizationId,
            key: 'expense_generator',
            name: 'Expense generator',
            rank: 50,
            isProtected: false,
          })
          .returning({ id: roles.id });
        await db.insert(rolePermissions).values({
          organizationId,
          roleId: role!.id,
          permissionKey: 'expenses.create',
        });
        const [membership] = await db
          .insert(organizationMemberships)
          .values({
            organizationId,
            userId: generator.id,
            status: 'active',
          })
          .returning({ id: organizationMemberships.id });
        await assignRole(db, {
          organizationId,
          membershipId: membership!.id,
          userId: generator.id,
          roleId: role!.id,
        });
      });

      await database.asUser(generator.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO recurring_financial_draft_runs (
            organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
          ) VALUES (
            ${organizationId}::uuid, ${draftId}::uuid, '2026-09-02', 'expense', ${expenseId}::uuid
          )
        `);
      });

      const runs = await database.asService(async (db) =>
        resultRows<{ id: string }>(
          await db.execute(sql`
            SELECT id FROM recurring_financial_draft_runs
            WHERE draft_id = ${draftId}::uuid AND generated_entity_id = ${expenseId}::uuid
          `),
        ),
      );
      expect(runs[0]?.id).toBeTruthy();
    });

    it('scopes recurring run identity by entity type so shared UUIDs do not collide', async () => {
      const owner = await createTestUser(database, 'owner-rec-identity@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Recurring Identity Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const linkedId = '01900000-0000-7000-8000-00000000bb01';
      const unlinkedId = '01900000-0000-7000-8000-00000000bb02';
      const ids = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Identity Vendor' });
        const client = await createClient(context, { name: 'Identity Client' });
        const project = await createProject(context, {
          name: 'Identity Project',
          clientId: client.id,
        });

        const expenseDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'expense', 'Shared expense', 'monthly', 1,
              '2026-09-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const billDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'vendor_bill', 'Shared bill', 'monthly', 1,
              '2026-09-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const billingDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'billing_record', 'Shared billing', 'monthly', 1,
              '2026-09-01', '{"amount":"1000"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );
        const unlinkedExpenseDraft = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, interval_count,
              next_run_date, payload_json, status
            ) VALUES (
              ${organizationId}::uuid, 'expense', 'Unlinked expense', 'monthly', 1,
              '2026-10-01', '{"amount":"500"}'::jsonb, 'active'
            )
            RETURNING id
          `),
        );

        await tx.execute(sql`
          INSERT INTO expenses (
            id, organization_id, expense_date, net_amount, gross_amount, currency, status
          ) VALUES
            (${linkedId}::uuid, ${organizationId}::uuid, '2026-09-01', 1000, 1000, 'ILS', 'draft'),
            (${unlinkedId}::uuid, ${organizationId}::uuid, '2026-10-01', 500, 500, 'ILS', 'draft')
        `);
        await tx.execute(sql`
          INSERT INTO ap_bills (
            id, organization_id, vendor_id, status, currency, total_amount, bill_date
          ) VALUES
            (${linkedId}::uuid, ${organizationId}::uuid, ${vendor.id}::uuid, 'draft', 'ILS', 1000, '2026-09-01'),
            (${unlinkedId}::uuid, ${organizationId}::uuid, ${vendor.id}::uuid, 'draft', 'ILS', 500, '2026-10-01')
        `);
        await tx.execute(sql`
          INSERT INTO billing_records (
            id, organization_id, project_id, issue_date, status,
            subtotal_amount, total_amount, currency
          ) VALUES (
            ${linkedId}::uuid, ${organizationId}::uuid, ${project.projectId}::uuid, '2026-09-01', 'draft',
            1000, 1000, 'ILS'
          )
        `);

        return {
          expenseDraftId: expenseDraft[0]!.id,
          billDraftId: billDraft[0]!.id,
          billingDraftId: billingDraft[0]!.id,
          unlinkedExpenseDraftId: unlinkedExpenseDraft[0]!.id,
        };
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO recurring_financial_draft_runs (
            organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
          ) VALUES
            (${organizationId}::uuid, ${ids.expenseDraftId}::uuid, '2026-09-01', 'expense', ${linkedId}::uuid),
            (${organizationId}::uuid, ${ids.billDraftId}::uuid, '2026-09-02', 'vendor_bill', ${linkedId}::uuid),
            (${organizationId}::uuid, ${ids.billingDraftId}::uuid, '2026-09-03', 'billing_record', ${linkedId}::uuid),
            (${organizationId}::uuid, ${ids.unlinkedExpenseDraftId}::uuid, '2026-10-01', 'expense', ${unlinkedId}::uuid)
        `);
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_draft_runs (
              organization_id, draft_id, run_date, generated_entity_type, generated_entity_id
            ) VALUES (
              ${organizationId}::uuid, ${ids.expenseDraftId}::uuid, '2026-09-04', 'expense', ${linkedId}::uuid
            )
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`DELETE FROM expenses WHERE id = ${linkedId}::uuid`),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`DELETE FROM ap_bills WHERE id = ${linkedId}::uuid`),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`DELETE FROM billing_records WHERE id = ${linkedId}::uuid`),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`DELETE FROM ap_bills WHERE id = ${unlinkedId}::uuid`);
        const remainingBills = resultRows<{ id: string }>(
          await tx.execute(sql`SELECT id FROM ap_bills WHERE id = ${unlinkedId}::uuid`),
        );
        expect(remainingBills).toHaveLength(0);
        await expect(
          tx.execute(sql`DELETE FROM expenses WHERE id = ${unlinkedId}::uuid`),
        ).rejects.toThrow();
      });
    });
  });
});
