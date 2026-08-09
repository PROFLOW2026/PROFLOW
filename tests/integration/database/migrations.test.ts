import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { seedSystemData } from '@drizzle/seed/system';
import { permissions, taxRules } from '@drizzle/schema';
import { PERMISSION_CATALOG } from '@/shared/permissions/catalog';

/**
 * Wave 0 acceptance §7: a clean database must apply the committed migrations
 * reproducibly, and the system seed must be idempotent.
 */
describe('migrations and system seed', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('applies every migration to a clean database', async () => {
    const rows = resultRows<{ tablename: string }>(
      await database.db.execute(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`),
    );
    const names = rows.map((row) => row.tablename);

    for (const expected of [
      'organizations',
      'organization_memberships',
      'permissions',
      'roles',
      'role_assignments',
      'audit_events',
      'projects',
      'work_packages',
      'expenses',
      'expense_allocations',
      'change_requests',
      'change_orders',
      'billing_records',
      'payments',
      'documents',
      'time_entries',
      'tax_rules',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('enables and forces row level security on every tenant-owned table', async () => {
    const rows = resultRows<{ tablename: string }>(
      await database.db.execute(sql`
        select c.relname as tablename
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
            where col.table_schema = 'public'
              and col.table_name = c.relname
              and col.column_name = 'organization_id'
          )
          and (c.relrowsecurity = false or c.relforcerowsecurity = false)
      `),
    );

    expect(rows.map((row) => row.tablename)).toEqual([]);
  });

  it('protects profiles, organizations and permissions with policies too', async () => {
    const rows = resultRows<{ tablename: string; relrowsecurity: boolean }>(
      await database.db.execute(sql`
        select c.relname as tablename, c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('profiles', 'user_preferences', 'organizations', 'permissions')
      `),
    );

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it('creates the deferred contract value event foreign key', async () => {
    const rows = resultRows(
      await database.db.execute(
        sql`select conname from pg_constraint where conname = 'contract_value_events_change_order_id_fk'`,
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it('runs the system seed idempotently', async () => {
    await database.asService(async (db) => {
      await seedSystemData(db);
      await seedSystemData(db);
    });

    const permissionRows = await database.db.select().from(permissions);
    expect(permissionRows).toHaveLength(PERMISSION_CATALOG.length);

    const taxRows = await database.db.select().from(taxRules);
    expect(taxRows).toHaveLength(2);
    expect(taxRows.every((row) => row.organizationId === null)).toBe(true);
  });
});
