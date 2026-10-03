import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

describe('quality migration 0164 (inspections + defects)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });

  it('creates the quality tables with forced RLS', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        await db.execute(sql`
          SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
          WHERE relnamespace = 'public'::regnamespace
            AND relname IN ('quality_inspection_templates', 'quality_inspection_template_items',
              'quality_inspections', 'quality_inspection_items', 'quality_inspection_outcomes',
              'defects', 'defect_cycle_records')
          ORDER BY relname`),
      ),
    );
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('installs the append-only and defect guard triggers', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ tgname: string }>(
        await db.execute(sql`
          SELECT tgname FROM pg_trigger
          WHERE tgname IN ('quality_inspection_outcomes_append_only', 'defect_cycle_records_append_only',
            'defects_transition_guard', 'defects_external_update_guard')
          ORDER BY tgname`),
      ),
    );
    expect(rows.map((row) => row.tgname)).toEqual([
      'defect_cycle_records_append_only',
      'defects_external_update_guard',
      'defects_transition_guard',
      'quality_inspection_outcomes_append_only',
    ]);
  });
});
