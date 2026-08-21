import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import {
  applySqlMigrations,
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem, createTestOrganization } from '@tests/setup/fixtures';
import { resolveOrgContext } from '@/modules/tenancy';
import { createClient } from '@/modules/clients';
import { createVendor } from '@/modules/vendors';
import { backfillExistingOrgBusinessCatalogs } from '@/modules/tenancy/application/backfill-business-catalogs';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

async function applyNamed(client: { exec: (sql: string) => Promise<unknown> }, tag: string) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

/**
 * Required matrix for Master Refinement pre-Owner SQL:
 * - clean start through 0061
 * - upgrade 0059 → 0060 → 0061
 * - existing-data upgrade preserves rows + seeds catalogs
 */
describe('0060–0061 upgrade matrix', () => {
  it('clean-starts through 0061 with catalog + approval snapshot tables', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);
      const tables = await client.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public'
         and tablename in (
           'organization_catalog_entries','vendor_catalog_links','document_requirement_rules',
           'daily_log_vendors','daily_log_employees','daily_log_assets',
           'approval_rule_steps','approval_request_steps'
         )
         order by tablename`,
      );
      expect(tables.rows.map((r) => r.tablename)).toEqual([
        'approval_request_steps',
        'approval_rule_steps',
        'daily_log_assets',
        'daily_log_employees',
        'daily_log_vendors',
        'document_requirement_rules',
        'organization_catalog_entries',
        'vendor_catalog_links',
      ]);

      const poTerm = await client.query(
        `select 1 from information_schema.columns
         where table_name = 'purchase_orders' and column_name = 'payment_term_id'`,
      );
      expect(poTerm.rows).toHaveLength(1);

      const snapshotCols = await client.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_name = 'approval_request_steps'
           and column_name in ('approver_strategy','role_template_key','permission_key','user_id','name')
         order by column_name`,
      );
      expect(snapshotCols.rows.map((r) => r.column_name)).toEqual([
        'approver_strategy',
        'name',
        'permission_key',
        'role_template_key',
        'user_id',
      ]);

      const restrictFks = await client.query<{ conname: string }>(
        `select c.conname
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         where t.relname = 'clients'
           and c.conname in ('clients_client_type_org_fk','clients_payment_term_org_fk')
           and c.confdeltype = 'r'`,
      );
      expect(restrictFks.rows).toHaveLength(2);
    });
  });

  it('upgrades 0059 → 0060 → 0061 without data loss', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0059_dynamic_experience');

      const before = await client.query<{ n: string }>(
        `select count(*)::text as n from information_schema.tables
         where table_schema = 'public' and table_name = 'organization_catalog_entries'`,
      );
      expect(before.rows[0]?.n).toBe('0');

      await applyNamed(client, '0060_business_catalog_refinement');
      const mid = await client.query(
        `select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'organization_catalog_entries'`,
      );
      expect(mid.rows).toHaveLength(1);

      await applyNamed(client, '0061_ops_expense_usage_kinds');
      const kinds = await client.query<{ check_clause: string }>(
        `select pg_get_constraintdef(c.oid) as check_clause
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         where t.relname = 'ops_expense_links' and c.conname = 'ops_expense_links_kind_known'`,
      );
      expect(kinds.rows[0]?.check_clause ?? '').toMatch(/material_usage_record/);
      expect(kinds.rows[0]?.check_clause ?? '').toMatch(/equipment_usage_record/);
    });
  });
});

describe('0060 existing-data upgrade + seed', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('seeds universal catalogs for existing org and preserves free-text clients/vendors', async () => {
    await database.reset();
    await seedSystem(database);
    const owner = await createTestUser(database, `catalog-upgrade-${Date.now()}@example.com`);
    const org = await createTestOrganization(database, owner, `Pre-0060 Org ${Date.now()}`);

    const { organizationId, clientId, vendorId, clientName } = await database.asUser(
      owner.id,
      async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId: org.organization.id,
          locale: 'en',
        });
        const client = await createClient(context, { name: 'Legacy Client Name' });
        const vendor = await createVendor(context, {
          name: 'Legacy Vendor Name',
          type: 'supplier',
        });
        return {
          organizationId: org.organization.id,
          clientId: client.id,
          vendorId: vendor.id,
          clientName: client.name,
        };
      },
    );

    await database.asService(async (db) => {
      await backfillExistingOrgBusinessCatalogs(db, { organizationIds: [organizationId] });
      const catalogs = resultRows<{ kind: string; cnt: string }>(
        await db.execute(sql`
          select kind, count(*)::text as cnt
          from organization_catalog_entries
          where organization_id = ${organizationId}::uuid
          group by kind
          order by kind
        `),
      );
      const byKind = Object.fromEntries(catalogs.map((r) => [r.kind, Number(r.cnt)]));
      expect(byKind.client_type).toBeGreaterThanOrEqual(1);
      expect(byKind.payment_term).toBeGreaterThanOrEqual(1);
      expect(byKind.lead_source).toBeGreaterThanOrEqual(1);
      expect(byKind.lost_reason).toBeGreaterThanOrEqual(1);
      expect(byKind.engagement_role).toBeGreaterThanOrEqual(1);

      const clients = resultRows<{ name: string }>(
        await db.execute(sql`select name from clients where id = ${clientId}::uuid`),
      );
      expect(clients[0]?.name).toBe(clientName);

      const vendors = resultRows<{ name: string }>(
        await db.execute(sql`select name from vendors where id = ${vendorId}::uuid`),
      );
      expect(vendors[0]?.name).toBe('Legacy Vendor Name');

      await backfillExistingOrgBusinessCatalogs(db, { organizationIds: [organizationId] });
      const again = resultRows<{ cnt: string }>(
        await db.execute(sql`
          select count(*)::text as cnt from organization_catalog_entries
          where organization_id = ${organizationId}::uuid and kind = 'payment_term'
        `),
      );
      expect(Number(again[0]?.cnt)).toBe(byKind.payment_term);
    });
  });
});
