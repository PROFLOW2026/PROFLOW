import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

const ACL_RESTORE_SQL = readFileSync(
  path.resolve(process.cwd(), 'drizzle/migrations/0213_boq_nodes_acl_restore_after_0205.sql'),
  'utf8',
);
const WORK_GRANT_SQL = readFileSync(
  path.resolve(process.cwd(), 'drizzle/migrations/0214_boq_work_grants_after_0213.sql'),
  'utf8',
);

/** PGlite rejects multi-statement prepared queries — one statement per execute. */
function loadAclRestoreStatementsFrom(source: string): string[] {
  return source.split('--> statement-breakpoint')
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

function loadAclRestoreStatements(): string[] {
  return loadAclRestoreStatementsFrom(ACL_RESTORE_SQL);
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
  auth_progress_insert: true,
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
  const workGrantStatements = loadAclRestoreStatementsFrom(WORK_GRANT_SQL);

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  it('fresh journal through 0214 keeps 0213 locks and restores 0035 work grants', async () => {
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
      const columns = resultRows<{
        sched_qty: boolean;
        sched_rate: boolean;
        sched_amount: boolean;
        val_qty: boolean;
        val_rate: boolean;
        progress_id: boolean;
        progress_price: boolean;
        alloc_insert: boolean;
      }>(
        await db.execute(sql`
          SELECT
            has_column_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'agreed_quantity', 'SELECT') AS sched_qty,
            has_column_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'unit_rate', 'SELECT') AS sched_rate,
            has_column_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'amount', 'SELECT') AS sched_amount,
            has_column_privilege('authenticated', 'public.boq_subcontractor_valuation_lines', 'approved_quantity', 'SELECT') AS val_qty,
            has_column_privilege('authenticated', 'public.boq_subcontractor_valuation_lines', 'unit_rate_snapshot', 'SELECT') AS val_rate,
            has_column_privilege('authenticated', 'public.boq_progress_lines', 'id', 'SELECT') AS progress_id,
            has_column_privilege('authenticated', 'public.boq_progress_lines', 'unit_price_snapshot', 'SELECT') AS progress_price,
            has_table_privilege('authenticated', 'public.boq_change_allocations', 'INSERT') AS alloc_insert
        `),
      );
      expect(columns[0]).toEqual({
        sched_qty: true,
        sched_rate: false,
        sched_amount: false,
        val_qty: true,
        val_rate: false,
        progress_id: true,
        progress_price: false,
        alloc_insert: true,
      });
    });
  });

  it('prod-sim: 0205 grants, then 0213, then 0214 restores the 0035 work grants', async () => {
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
    const broken = await readCorePrivileges(database);
    expect(broken.auth_nodes_insert).toBe(false);
    expect(broken.auth_progress_insert).toBe(false);

    await database.asService(async (db) => {
      await execStatements(db, workGrantStatements);
    });
    expect(await readCorePrivileges(database)).toEqual(restoredCore);

    await database.asService(async (db) => {
      await execStatements(db, workGrantStatements);
    });
    expect(await readCorePrivileges(database)).toEqual(restoredCore);
  });
});
