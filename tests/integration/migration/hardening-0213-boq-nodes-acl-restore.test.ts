import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

const ACL_RESTORE_SQL = readFileSync(
  path.resolve(process.cwd(), 'drizzle/migrations/0213_boq_nodes_acl_restore_after_0205.sql'),
  'utf8',
);

/** PGlite rejects multi-statement prepared queries — one statement per execute. */
function loadAclRestoreStatements(): string[] {
  return ACL_RESTORE_SQL.split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim();
          return trimmed.length > 0 && !trimmed.startsWith('--');
        })
        .join('\n')
        .replace(/;\s*$/u, '')
        .trim(),
    )
    .filter((chunk) => chunk.length > 0);
}

async function execStatements(
  db: { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> },
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

type CorePriv = {
  auth_nodes_select: boolean;
  auth_nodes_insert: boolean;
  auth_secure_select: boolean;
  auth_secure_insert: boolean;
  auth_progress_id_select: boolean;
  auth_progress_unit_price_select: boolean;
  auth_progress_insert: boolean;
  auth_permissions_insert: boolean;
  auth_audit_update: boolean;
  auth_auth_rate_select: boolean;
  auth_connected_map_insert: boolean;
  auth_money_secure_insert: boolean;
  auth_mutate_exec: boolean;
  anon_mutate_exec: boolean;
};

async function readCorePrivileges(database: TestDatabase): Promise<CorePriv> {
  return database.asService(async (db) => {
    const rows = resultRows<CorePriv>(
      await db.execute(sql`
        SELECT
          has_table_privilege('authenticated', 'public.boq_nodes', 'SELECT') AS auth_nodes_select,
          has_table_privilege('authenticated', 'public.boq_nodes', 'INSERT') AS auth_nodes_insert,
          has_table_privilege('authenticated', 'public.boq_nodes_secure', 'SELECT') AS auth_secure_select,
          has_table_privilege('authenticated', 'public.boq_nodes_secure', 'INSERT') AS auth_secure_insert,
          has_column_privilege('authenticated', 'public.boq_progress_lines', 'id', 'SELECT') AS auth_progress_id_select,
          has_column_privilege('authenticated', 'public.boq_progress_lines', 'unit_price_snapshot', 'SELECT') AS auth_progress_unit_price_select,
          has_table_privilege('authenticated', 'public.boq_progress_lines', 'INSERT') AS auth_progress_insert,
          has_table_privilege('authenticated', 'public.permissions', 'INSERT') AS auth_permissions_insert,
          has_table_privilege('authenticated', 'public.audit_events', 'UPDATE') AS auth_audit_update,
          has_table_privilege('authenticated', 'public.auth_rate_limits', 'SELECT') AS auth_auth_rate_select,
          has_table_privilege('authenticated', 'public.connected_project_mappings', 'INSERT') AS auth_connected_map_insert,
          has_table_privilege('authenticated', 'public.subcontract_agreement_money_secure', 'INSERT') AS auth_money_secure_insert,
          has_function_privilege(
            'authenticated',
            'app.boq_mutate_draft_node(uuid, text, uuid, jsonb)',
            'EXECUTE'
          ) AS auth_mutate_exec,
          has_function_privilege(
            'anon',
            'app.boq_mutate_draft_node(uuid, text, uuid, jsonb)',
            'EXECUTE'
          ) AS anon_mutate_exec
      `),
    );
    return rows[0]!;
  });
}

const restoredCore: CorePriv = {
  auth_nodes_select: false,
  auth_nodes_insert: false,
  auth_secure_select: true,
  auth_secure_insert: false,
  auth_progress_id_select: true,
  auth_progress_unit_price_select: false,
  auth_progress_insert: false,
  auth_permissions_insert: false,
  auth_audit_update: false,
  auth_auth_rate_select: false,
  auth_connected_map_insert: false,
  auth_money_secure_insert: false,
  auth_mutate_exec: true,
  anon_mutate_exec: false,
};

describe('0213 ACL restore after 0205 blanket GRANT', () => {
  let database: TestDatabase;
  const restoreStatements = loadAclRestoreStatements();

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  it('fresh journal through 0213 restores proven privilege policies', async () => {
    expect(restoreStatements.length).toBeGreaterThan(40);
    expect(await readCorePrivileges(database)).toEqual(restoredCore);

    await database.asService(async (db) => {
      const rows = resultRows<{
        schedule_select: boolean;
        schedule_insert: boolean;
        installment_insert: boolean;
        installment_delete: boolean;
      }>(
        await db.execute(sql`
          SELECT
            has_table_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'SELECT') AS schedule_select,
            has_table_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'INSERT') AS schedule_insert,
            has_table_privilege('authenticated', 'public.expense_installment_payments', 'INSERT') AS installment_insert,
            has_table_privilege('authenticated', 'public.expense_installment_payments', 'DELETE') AS installment_delete
        `),
      );
      expect(rows[0]).toEqual({
        schedule_select: false,
        schedule_insert: true,
        installment_insert: true,
        installment_delete: false,
      });
    });
  });

  it('prod-sim: 0205-style grants then 0213 restores ACL (idempotent)', async () => {
    await database.asService(async (db) => {
      await execStatements(db, [
        'GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated',
        'GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role',
      ]);
    });

    const before = await readCorePrivileges(database);
    expect(before.auth_nodes_insert).toBe(true);
    expect(before.auth_secure_insert).toBe(true);
    expect(before.auth_permissions_insert).toBe(true);
    expect(before.auth_connected_map_insert).toBe(true);

    await database.asService(async (db) => {
      await execStatements(db, restoreStatements);
    });
    expect(await readCorePrivileges(database)).toEqual(restoredCore);

    await database.asService(async (db) => {
      await execStatements(db, restoreStatements);
    });
    expect(await readCorePrivileges(database)).toEqual(restoredCore);
  });
});
