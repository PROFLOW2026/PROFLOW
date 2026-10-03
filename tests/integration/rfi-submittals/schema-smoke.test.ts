import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

describe('migration 0163 (RFI + submittals) applies', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });

  it('creates every table with forced RLS', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ relname: string; relforcerowsecurity: boolean }>(
        await db.execute(sql`
          select relname, relforcerowsecurity from pg_class
          where relname in ('rfis','rfi_answers','rfi_status_events','submittals','submittal_revisions','submittal_reviews')
          order by relname`),
      ),
    );
    expect(rows.map((r) => r.relname)).toEqual([
      'rfi_answers',
      'rfi_status_events',
      'rfis',
      'submittal_reviews',
      'submittal_revisions',
      'submittals',
    ]);
    expect(rows.every((r) => r.relforcerowsecurity)).toBe(true);
  });
});
