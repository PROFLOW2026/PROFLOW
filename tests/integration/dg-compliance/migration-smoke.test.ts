import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

describe('Track P migration 0166 applies', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });

  it('creates the Track P tables with forced RLS', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ relname: string; forced: boolean }>(
        await db.execute(sql`
          select c.relname, c.relforcerowsecurity as forced
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname in (
            'contractor_compliance_requirements', 'contractor_compliance_documents',
            'contractor_compliance_reminders', 'safety_record_contractor_links',
            'safety_action_task_links', 'delivery_items', 'delivery_item_reports')
          order by c.relname`),
      ),
    );
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.forced)).toBe(true);
  });
});
