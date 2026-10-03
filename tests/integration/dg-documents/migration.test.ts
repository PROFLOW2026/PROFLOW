import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

describe('Track IJ migration 0162 shape', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });

  it('creates the documents / plans tables with forced RLS', async () => {
    const rows = await database.asService((db) =>
      db.execute(sql`
        select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (
          'evidence_items', 'document_shares', 'document_share_acknowledgements', 'drawings',
          'drawing_revisions', 'drawing_distribution_entries', 'drawing_revision_acknowledgements'
        )
        order by c.relname`),
    );
    const tables = resultRows<{ name: string; rls: boolean; forced: boolean }>(rows);
    expect(tables.map((t) => t.name)).toEqual([
      'document_share_acknowledgements',
      'document_shares',
      'drawing_distribution_entries',
      'drawing_revision_acknowledgements',
      'drawing_revisions',
      'drawings',
      'evidence_items',
    ]);
    expect(tables.every((t) => t.rls && t.forced)).toBe(true);
  });
});
