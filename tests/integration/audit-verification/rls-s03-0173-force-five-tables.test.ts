/**
 * S03 / OPS-B-003 — journal 0173 five-table FORCE RLS parity on PGlite (Gate A evidence).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

const FORCE_FIVE_TABLES = [
  'subcontract_claim_sequences',
  'rfi_submittal_sequences',
  'estimate_text_blocks',
  'quote_default_text_blocks',
  'attendance_correction_requests',
] as const;

describe('S03 — 0173 FORCE RLS on five legacy tables', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('enables and forces RLS on every 0173 table', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        await db.execute(sql`
          SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN (
              'subcontract_claim_sequences',
              'rfi_submittal_sequences',
              'estimate_text_blocks',
              'quote_default_text_blocks',
              'attendance_correction_requests'
            )
          ORDER BY c.relname
        `),
      ),
    );

    expect(rows.map((r) => r.relname)).toEqual([...FORCE_FIVE_TABLES].sort());
    expect(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
  });

  it('keeps service_role ALL policy on attendance_correction_requests (0175 parity)', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ policyname: string }>(
        await db.execute(sql`
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'attendance_correction_requests'
            AND 'service_role' = ANY(roles)
        `),
      ),
    );
    expect(rows.some((r) => r.policyname.includes('service'))).toBe(true);
  });
});
