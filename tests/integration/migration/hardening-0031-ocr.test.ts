import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
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

async function apply0031(client: {
  exec: (statement: string) => Promise<unknown>;
}): Promise<void> {
  const raw = await readFile(path.join(MIGRATIONS_DIR, '0031_ocr_vendor_credit_target.sql'), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

function errorBlob(error: unknown): string {
  if (!error) return '';
  if (typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string; code?: string };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

describe('migration hardening 0031 OCR vendor credit', () => {
  describe('clean start and 0030→0031', () => {
    it('clean-starts 0000→0031 with credit column, strict check, RESTRICT FKs', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client);
        const col = await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ocr_extraction_jobs'
             AND column_name = 'confirmed_vendor_credit_id'`,
        );
        expect(col.rows.length).toBe(1);

        const check = await client.query(
          `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
           WHERE conname = 'ocr_extraction_jobs_confirmed_target_shape'`,
        );
        const def = String((check.rows[0] as { def: string }).def);
        expect(def).toMatch(/confirmed_expense_id IS NOT NULL/i);
        expect(def).toMatch(/confirmed_vendor_bill_id IS NOT NULL/i);
        expect(def).toMatch(/confirmed_vendor_credit_id IS NOT NULL/i);
        expect(def).toMatch(/vendor_credit/);

        const fks = await client.query(
          `SELECT conname, confdeltype
           FROM pg_constraint
           WHERE conname IN (
             'ocr_extraction_jobs_expense_org_fk',
             'ocr_extraction_jobs_vendor_bill_org_fk',
             'ocr_extraction_jobs_vendor_credit_org_fk'
           )
           ORDER BY conname`,
        );
        expect(fks.rows).toEqual([
          { conname: 'ocr_extraction_jobs_expense_org_fk', confdeltype: 'r' },
          { conname: 'ocr_extraction_jobs_vendor_bill_org_fk', confdeltype: 'r' },
          { conname: 'ocr_extraction_jobs_vendor_credit_org_fk', confdeltype: 'r' },
        ]);
      });
    });

    it('upgrades 0030 → 0031 preserving expense/bill confirms and normalizing incomplete targets', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client, '0030_gap_closure_corrections_retention_recurring');

        const orgId = randomUUID();
        const userId = randomUUID();
        const expenseId = randomUUID();
        const billId = randomUUID();
        const vendorId = randomUUID();
        const incompleteJobId = randomUUID();
        const expenseJobId = randomUUID();
        const billJobId = randomUUID();
        const badMetaJobId = randomUUID();
        const goodMetaJobId = randomUUID();
        const creditId = randomUUID();
        const membershipId = randomUUID();
        const untouchedMeta = JSON.stringify({ providerId: 'azure', note: 'keep-me' }).replace(
          /'/g,
          "''",
        );

        await client.exec(`
          INSERT INTO profiles (id, email, display_name)
          VALUES ('${userId}', 'ocr31@example.test', 'OCR 31');

          INSERT INTO organizations (id, name, country_code, timezone, base_currency, default_locale)
          VALUES ('${orgId}', 'OCR 31 Org', 'IL', 'Asia/Jerusalem', 'ILS', 'he-IL');

          INSERT INTO organization_memberships (id, organization_id, user_id, status)
          VALUES ('${membershipId}', '${orgId}', '${userId}', 'active');

          INSERT INTO vendors (id, organization_id, name, status, type)
          VALUES ('${vendorId}', '${orgId}', 'Vendor 31', 'active', 'supplier');

          INSERT INTO expenses (
            id, organization_id, status, currency, net_amount, gross_amount,
            expense_date, description
          ) VALUES (
            '${expenseId}', '${orgId}', 'draft', 'ILS', 100, 100,
            '2026-08-01', 'ocr expense'
          );

          INSERT INTO ap_bills (
            id, organization_id, vendor_id, status, currency, total_amount, bill_date
          ) VALUES (
            '${billId}', '${orgId}', '${vendorId}', 'draft', 'ILS', 200, '2026-08-01'
          );

          INSERT INTO ap_vendor_credits (
            id, organization_id, vendor_id, credit_date, currency, amount, status
          ) VALUES (
            '${creditId}', '${orgId}', '${vendorId}', '2026-08-01', 'ILS', 50, 'draft'
          );

          INSERT INTO ocr_extraction_jobs (
            id, organization_id, status, review_status, provider_id,
            confirmed_draft_target, confirmed_expense_id, confirmed_vendor_bill_id, raw_metadata
          ) VALUES
          (
            '${expenseJobId}', '${orgId}', 'succeeded', 'accepted', 'azure',
            'expense', '${expenseId}', NULL, '${untouchedMeta}'::jsonb
          ),
          (
            '${billJobId}', '${orgId}', 'succeeded', 'accepted', 'azure',
            'vendor_bill', NULL, '${billId}', '${untouchedMeta}'::jsonb
          ),
          (
            '${incompleteJobId}', '${orgId}', 'succeeded', 'accepted', 'azure',
            'expense', NULL, NULL, '{"providerId":"azure"}'::jsonb
          ),
          (
            '${badMetaJobId}', '${orgId}', 'needs_review', 'awaiting_review', 'azure',
            NULL, NULL, NULL,
            '{"confirmedApplicationTarget":"vendor_credit","confirmedVendorCreditId":"not-a-uuid"}'::jsonb
          ),
          (
            '${goodMetaJobId}', '${orgId}', 'succeeded', 'accepted', 'azure',
            NULL, NULL, NULL,
            '{"confirmedApplicationTarget":"vendor_credit","confirmedVendorCreditId":"${creditId}"}'::jsonb
          );
        `);

        await apply0031(client);

        const expenseRow = await client.query(
          `SELECT confirmed_draft_target, confirmed_expense_id::text AS eid
           FROM ocr_extraction_jobs WHERE id = '${expenseJobId}'`,
        );
        expect(expenseRow.rows[0]).toEqual({
          confirmed_draft_target: 'expense',
          eid: expenseId,
        });

        const billRow = await client.query(
          `SELECT confirmed_draft_target, confirmed_vendor_bill_id::text AS bid
           FROM ocr_extraction_jobs WHERE id = '${billJobId}'`,
        );
        expect(billRow.rows[0]).toEqual({
          confirmed_draft_target: 'vendor_bill',
          bid: billId,
        });

        const incomplete = await client.query(
          `SELECT confirmed_draft_target, confirmed_expense_id
           FROM ocr_extraction_jobs WHERE id = '${incompleteJobId}'`,
        );
        expect(incomplete.rows[0]).toEqual({
          confirmed_draft_target: null,
          confirmed_expense_id: null,
        });

        const badMeta = await client.query(
          `SELECT confirmed_draft_target, confirmed_vendor_credit_id,
                  raw_metadata->>'confirmedVendorCreditId' AS meta
           FROM ocr_extraction_jobs WHERE id = '${badMetaJobId}'`,
        );
        expect(badMeta.rows[0]).toEqual({
          confirmed_draft_target: null,
          confirmed_vendor_credit_id: null,
          meta: 'not-a-uuid',
        });

        const goodMeta = await client.query(
          `SELECT confirmed_draft_target, confirmed_vendor_credit_id::text AS cid
           FROM ocr_extraction_jobs WHERE id = '${goodMetaJobId}'`,
        );
        expect(goodMeta.rows[0]).toEqual({
          confirmed_draft_target: 'vendor_credit',
          cid: creditId,
        });

        const untouched = await client.query(
          `SELECT raw_metadata->>'note' AS note
           FROM ocr_extraction_jobs WHERE id = '${expenseJobId}'`,
        );
        expect((untouched.rows[0] as { note: string }).note).toBe('keep-me');
      });
    });
  });

  describe('strict shape, FK restrict, RLS', () => {
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

    it('accepts valid vendor credit confirm and rejects target without ID / multi-target', async () => {
      const owner = await createTestUser(database, 'ocr-strict@example.test');
      const { organizationId, vendorId, creditId } = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Strict OCR Org',
          countryCode: 'IL',
        });
        const organizationId = created.organization.id;
        return database.asUser(owner.id, async (tx) => {
          const context = await resolveOrgContext(tx, {
            userId: owner.id,
            organizationId,
            locale: 'en',
          });
          const vendor = await createVendor(context, { name: 'Credit Vendor' });
          const inserted = resultRows<{ id: string }>(
            await tx.execute(sql`
              INSERT INTO ap_vendor_credits (
                organization_id, vendor_id, credit_date, currency, amount, status
              ) VALUES (
                ${organizationId}::uuid, ${vendor.id}::uuid, '2026-08-01', 'ILS', 40, 'draft'
              )
              RETURNING id
            `),
          );
          return { organizationId, vendorId: vendor.id, creditId: inserted[0]!.id };
        });
      });

      await database.asService(async (db) => {
        const ok = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO ocr_extraction_jobs (
              organization_id, status, review_status, provider_id,
              confirmed_draft_target, confirmed_vendor_credit_id
            ) VALUES (
              ${organizationId}::uuid, 'succeeded', 'accepted', 'azure',
              'vendor_credit', ${creditId}::uuid
            )
            RETURNING id
          `),
        );
        expect(ok[0]?.id).toBeTruthy();

        await expect(
          db.execute(sql`
            INSERT INTO ocr_extraction_jobs (
              organization_id, status, review_status, provider_id,
              confirmed_draft_target
            ) VALUES (
              ${organizationId}::uuid, 'succeeded', 'accepted', 'azure', 'vendor_credit'
            )
          `),
        ).rejects.toSatisfy((error: unknown) =>
          /ocr_extraction_jobs_confirmed_target_shape|check constraint/i.test(errorBlob(error)),
        );

        await expect(
          db.execute(sql`
            INSERT INTO ocr_extraction_jobs (
              organization_id, status, review_status, provider_id,
              confirmed_draft_target, confirmed_expense_id, confirmed_vendor_credit_id
            ) VALUES (
              ${organizationId}::uuid, 'succeeded', 'accepted', 'azure',
              'vendor_credit', ${randomUUID()}::uuid, ${creditId}::uuid
            )
          `),
        ).rejects.toSatisfy((error: unknown) =>
          /ocr_extraction_jobs_confirmed_target_shape|check constraint|foreign key/i.test(
            errorBlob(error),
          ),
        );
      });

      void vendorId;
    });

    it('rejects cross-org vendor credit FK and RESTRICTs delete of confirmed credit', async () => {
      const ownerA = await createTestUser(database, 'ocr-a31@example.test');
      const ownerB = await createTestUser(database, 'ocr-b31@example.test');

      const orgA = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerA.id, {
          name: 'Org A OCR31',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const orgB = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerB.id, {
          name: 'Org B OCR31',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const creditB = await database.asUser(ownerB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerB.id,
          organizationId: orgB,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'B Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_vendor_credits (
              organization_id, vendor_id, credit_date, currency, amount, status
            ) VALUES (
              ${orgB}::uuid, ${vendor.id}::uuid, '2026-08-01', 'ILS', 25, 'draft'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      const creditA = await database.asUser(ownerA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerA.id,
          organizationId: orgA,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'A Vendor' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO ap_vendor_credits (
              organization_id, vendor_id, credit_date, currency, amount, status
            ) VALUES (
              ${orgA}::uuid, ${vendor.id}::uuid, '2026-08-01', 'ILS', 25, 'draft'
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asService(async (db) => {
        await expect(
          db.execute(sql`
            INSERT INTO ocr_extraction_jobs (
              organization_id, status, review_status, provider_id,
              confirmed_draft_target, confirmed_vendor_credit_id
            ) VALUES (
              ${orgA}::uuid, 'succeeded', 'accepted', 'azure',
              'vendor_credit', ${creditB}::uuid
            )
          `),
        ).rejects.toSatisfy((error: unknown) =>
          /foreign key|ocr_extraction_jobs_vendor_credit_org_fk/i.test(errorBlob(error)),
        );

        await db.execute(sql`
          INSERT INTO ocr_extraction_jobs (
            organization_id, status, review_status, provider_id,
            confirmed_draft_target, confirmed_vendor_credit_id
          ) VALUES (
            ${orgA}::uuid, 'succeeded', 'accepted', 'azure',
            'vendor_credit', ${creditA}::uuid
          )
        `);

        await expect(
          db.execute(sql`DELETE FROM ap_vendor_credits WHERE id = ${creditA}::uuid`),
        ).rejects.toSatisfy((error: unknown) =>
          /restrict|foreign key|ocr_extraction_jobs_vendor_credit_org_fk/i.test(errorBlob(error)),
        );
      });
    });

    it('preserves RLS org isolation on ocr_extraction_jobs', async () => {
      const ownerA = await createTestUser(database, 'ocr-rls-a@example.test');
      const ownerB = await createTestUser(database, 'ocr-rls-b@example.test');
      const orgA = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerA.id, {
          name: 'RLS A',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const orgB = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerB.id, {
          name: 'RLS B',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const jobA = await database.asService(async (db) => {
        const rows = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO ocr_extraction_jobs (
              organization_id, status, review_status, provider_id
            ) VALUES (
              ${orgA}::uuid, 'needs_review', 'awaiting_review', 'azure'
            )
            RETURNING id
          `),
        );
        return rows[0]!.id;
      });

      const visibleToB = await database.asUser(ownerB.id, async (tx) =>
        resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM ocr_extraction_jobs WHERE id = ${jobA}::uuid
          `),
        ),
      );
      expect(visibleToB).toEqual([]);

      const visibleToA = await database.asUser(ownerA.id, async (tx) =>
        resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM ocr_extraction_jobs WHERE id = ${jobA}::uuid
          `),
        ),
      );
      expect(visibleToA.map((row) => row.id)).toEqual([jobA]);
      void orgB;
    });
  });
});
