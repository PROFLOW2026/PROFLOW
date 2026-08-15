import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySqlMigrations, splitSqlStatements, withRawPglite } from '@tests/setup/database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

type JournalEntry = { tag: string; when: number };
type QueryClient = {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string) => Promise<{ rows: unknown[] }>;
};

async function applyNamed(client: { exec: (sql: string) => Promise<unknown> }, tag: string) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

function tagNumber(tag: string): number {
  return Number.parseInt(tag.slice(0, 4), 10);
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function parseGenericRlsCalls(sql: string) {
  const column: Array<{ table: string; column: string }> = [];
  const parent: Array<{ table: string; parent: string; fk: string; parentCol: string }> = [];
  const colRe = /SELECT\s+app\.apply_project_column_rls\(\s*'([^']+)'\s*,\s*'([^']+)'/g;
  const parRe =
    /SELECT\s+app\.apply_project_parent_rls\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/g;
  for (const match of sql.matchAll(colRe)) {
    column.push({ table: match[1]!, column: match[2]! });
  }
  for (const match of sql.matchAll(parRe)) {
    parent.push({ table: match[1]!, parent: match[2]!, fk: match[3]!, parentCol: match[4]! });
  }
  return { column, parent };
}

type PolicyDump = {
  table: string;
  command: string;
  name: string;
  usingExpr: string;
  checkExpr: string;
  roles: string[];
};

function extractPermissionKeys(expr: string): string[] {
  const keys = new Set<string>();
  for (const match of expr.matchAll(/has_org_permission\([^,]+,\s*'([^']+)'/g)) {
    keys.add(match[1]!);
  }
  for (const match of expr.matchAll(/has_any_org_permission\([\s\S]*?ARRAY\[([^\]]+)\]/g)) {
    for (const key of match[1]!.matchAll(/'([^']+)'/g)) {
      keys.add(key[1]!);
    }
  }
  if (expr.includes('org_roles_unassigned')) keys.add('__bootstrap__');
  return [...keys].sort();
}

function policyCommand(cmd: string): string {
  if (cmd === 'r') return 'SELECT';
  if (cmd === 'a') return 'INSERT';
  if (cmd === 'w') return 'UPDATE';
  if (cmd === 'd') return 'DELETE';
  if (cmd === '*') return 'ALL';
  return cmd;
}

function isAlwaysFalseExpr(expr: string): boolean {
  const compact = expr.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!compact) return false;
  return /^(?:\()?false(?:\s+and\b|\)|$)/.test(compact);
}

function rewrittenTablesFromSql(sql: string): Set<string> {
  const tables = new Set<string>();
  for (const match of sql.matchAll(/apply_project_column_rls\(\s*'([^']+)'/g)) tables.add(match[1]!);
  for (const match of sql.matchAll(/apply_project_parent_rls\(\s*'([^']+)'/g)) tables.add(match[1]!);
  for (const match of sql.matchAll(/and_authenticated_policy_predicate\(\s*'([^']+)'/g)) {
    tables.add(match[1]!);
  }
  for (const match of sql.matchAll(/install_permissioned_rls\(\s*'([^']+)'/g)) tables.add(match[1]!);
  for (const match of sql.matchAll(/ON public\.([a-z0-9_]+)/g)) tables.add(match[1]!);
  return tables;
}

async function dumpAuthenticatedPolicies(client: QueryClient): Promise<PolicyDump[]> {
  const result = await client.query(
    `SELECT c.relname AS table_name,
            p.polname AS policy_name,
            p.polcmd AS cmd,
            COALESCE(pg_get_expr(p.polqual, p.polrelid), '') AS using_expr,
            COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') AS check_expr,
            COALESCE((
              SELECT array_agg(rol.rolname ORDER BY rol.rolname)
              FROM pg_roles rol
              WHERE rol.oid = ANY (p.polroles)
            ), ARRAY[]::name[]) AS roles
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
     ORDER BY c.relname, p.polname`,
  );
  return (result.rows as Array<Record<string, unknown>>).flatMap((row) => {
    const roles = Array.isArray(row.roles) ? (row.roles as string[]) : [];
    if (roles.length > 0 && roles.every((role) => role === 'service_role')) return [];
    return [
      {
        table: String(row.table_name),
        command: policyCommand(String(row.cmd)),
        name: String(row.policy_name),
        usingExpr: String(row.using_expr ?? ''),
        checkExpr: String(row.check_expr ?? ''),
        roles,
      },
    ];
  });
}

function buildParityMatrix(before: PolicyDump[], after: PolicyDump[]) {
  const afterByTableCmd = new Map<string, PolicyDump[]>();
  for (const policy of after) {
    const key = `${policy.table}|${policy.command}`;
    const list = afterByTableCmd.get(key) ?? [];
    list.push(policy);
    afterByTableCmd.set(key, list);
  }
  const beforeByTableCmd = new Map<string, PolicyDump[]>();
  for (const policy of before) {
    const key = `${policy.table}|${policy.command}`;
    const list = beforeByTableCmd.get(key) ?? [];
    list.push(policy);
    beforeByTableCmd.set(key, list);
  }
  const keys = new Set([...beforeByTableCmd.keys(), ...afterByTableCmd.keys()]);
  const matrix: Array<{
    table: string;
    command: string;
    oldPredicate: string;
    newPredicate: string;
    permissionPreserved: boolean;
    projectGateAdded: boolean;
    extraPermissivePolicy: boolean;
  }> = [];
  for (const key of [...keys].sort()) {
    const [table, command] = key.split('|') as [string, string];
    const oldPolicies = beforeByTableCmd.get(key) ?? [];
    const newPolicies = afterByTableCmd.get(key) ?? [];
    if (oldPolicies.length === 0 && newPolicies.length === 0) continue;
    const oldPredicate = oldPolicies
      .map((policy) => `${policy.name}:${policy.usingExpr || policy.checkExpr}`)
      .join(' || ');
    const newPredicate = newPolicies
      .map((policy) => `${policy.name}:${policy.usingExpr || policy.checkExpr}`)
      .join(' || ');
    const extraPermissivePolicy = newPolicies.some(
      (policy) => !oldPolicies.some((old) => old.name === policy.name),
    );
    const sameNamePermsPreserved = oldPolicies.every((old) => {
      const neu = newPolicies.find((policy) => policy.name === old.name);
      if (!neu) return true;
      if (isAlwaysFalseExpr(old.usingExpr) && isAlwaysFalseExpr(neu.usingExpr)) return true;
      const oldKeys = extractPermissionKeys(`${old.usingExpr} ${old.checkExpr}`);
      const newKeys = extractPermissionKeys(`${neu.usingExpr} ${neu.checkExpr}`);
      if (oldKeys.length === 0) return true;
      return newKeys.length > 0;
    });
    const permissionPreserved = !extraPermissivePolicy && sameNamePermsPreserved;
    const projectGateAdded = newPolicies.some(
      (policy) =>
        policy.usingExpr.includes('can_access_project') ||
        policy.usingExpr.includes('can_access_form_owner') ||
        policy.usingExpr.includes('can_access_document_owner') ||
        policy.usingExpr.includes('can_access_approval_target') ||
        policy.checkExpr.includes('can_access_project') ||
        policy.checkExpr.includes('can_access_form_owner') ||
        policy.checkExpr.includes('can_access_document_owner') ||
        policy.checkExpr.includes('can_access_approval_target'),
    );
    matrix.push({
      table,
      command,
      oldPredicate,
      newPredicate,
      permissionPreserved,
      projectGateAdded,
      extraPermissivePolicy,
    });
  }
  return matrix;
}

async function loadJournal(): Promise<JournalEntry[]> {
  const raw = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return raw.entries;
}

async function installDrizzleJournal(client: QueryClient, entries: JournalEntry[]): Promise<void> {
  await client.exec(`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
    TRUNCATE drizzle.__drizzle_migrations;
  `);
  for (const entry of entries) {
    const contents = await readFile(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8');
    await client.exec(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
       VALUES ('${sha256(contents)}', ${entry.when})`,
    );
  }
}

async function waveApplyFlags(client: QueryClient, journal: JournalEntry[]) {
  const rows = await client.query(`SELECT hash FROM drizzle.__drizzle_migrations`);
  const hashes = new Set(
    (rows.rows as Array<{ hash?: string }>).map((row) => String(row.hash ?? '')),
  );
  const flags: Record<string, boolean> = {};
  for (const tag of WAVE_TAGS) {
    const entry = journal.find((item) => item.tag === tag);
    if (!entry) {
      flags[tag] = false;
      continue;
    }
    const contents = await readFile(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8');
    flags[tag] = hashes.has(sha256(contents));
  }
  return flags;
}

const WAVE_TAGS = [
  '0046_multi_contract_projects',
  '0047_notifications_and_timesheets',
  '0048_document_versioning',
  '0049_wave2_workflows',
  '0050_wave3_operations',
  '0051_review_integrity_closure',
] as const;

async function assertWaveSchema(client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) {
  const tables = await client.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN (
         'notifications', 'timesheets', 'document_versions', 'document_folders',
         'activity_events', 'subcontract_agreements', 'subcontract_value_events',
         'ocr_batches', 'work_order_billing_sources', 'resource_bookings',
         'employee_unavailability', 'project_access_grants', 'safety_records',
         'safety_corrective_actions', 'inventory_reservations', 'inventory_counts'
       )
     ORDER BY tablename`,
  );
  expect(tables.rows).toHaveLength(16);

  const fns = await client.query(
    `SELECT p.proname
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'app'
       AND p.proname IN (
         'emit_notification', 'resolve_notifications', 'time_entries_approval_lock',
         'work_order_billing_live_guard', 'can_access_project', 'project_access_mode'
       )
     ORDER BY p.proname`,
  );
  expect(fns.rows).toHaveLength(6);

  const rls = await client.query(
    `SELECT c.relname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('notifications', 'timesheets', 'safety_records', 'inventory_reservations')
       AND (c.relrowsecurity = false OR c.relforcerowsecurity = false)`,
  );
  expect(rls.rows).toEqual([]);
}

describe('overnight 3-wave migrations 0046–0051', () => {
  it('clean-starts 0000 → 0051', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);
      await assertWaveSchema(client);

      const cols = await client.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (
             (table_name = 'contracts' AND column_name IN ('contract_type', 'contract_number', 'client_id'))
             OR (table_name = 'project_boqs' AND column_name = 'contract_id')
             OR (table_name = 'billing_records' AND column_name IN ('contract_id', 'source_kind'))
             OR (table_name = 'time_entries' AND column_name = 'approval_status')
             OR (table_name = 'documents' AND column_name = 'current_version_id')
             OR (table_name = 'ocr_extraction_jobs' AND column_name = 'idempotency_key')
             OR (table_name = 'daily_logs' AND column_name = 'status')
             OR (table_name = 'inventory_items' AND column_name IN ('barcode', 'min_stock_level'))
           )`,
      );
      expect(cols.rows.length).toBeGreaterThanOrEqual(12);

      const projectSelect = await client.query(
        `SELECT pg_get_expr(polqual, polrelid) AS using_expr
         FROM pg_policy
         WHERE polname = 'projects_tenant_select'`,
      );
      const usingExpr = String((projectSelect.rows[0] as { using_expr?: string } | undefined)?.using_expr ?? '');
      expect(usingExpr).toContain('can_access_project');
    });
  }, 120_000);

  it('upgrades 0045 → 0051 without rewriting history', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0045_boq_reverse_allocation_changes_approve');
      const journal = await loadJournal();
      await installDrizzleJournal(
        client,
        journal.filter((entry) => tagNumber(entry.tag) <= 45),
      );

      const beforeJournal = await waveApplyFlags(client, journal);
      expect(beforeJournal['0046_multi_contract_projects']).toBe(false);
      expect(beforeJournal['0047_notifications_and_timesheets']).toBe(false);
      expect(beforeJournal['0048_document_versioning']).toBe(false);
      expect(beforeJournal['0049_wave2_workflows']).toBe(false);
      expect(beforeJournal['0050_wave3_operations']).toBe(false);
      expect(beforeJournal['0051_review_integrity_closure']).toBe(false);

      const before = await client.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'notifications'`,
      );
      expect(before.rows).toHaveLength(0);

      const sql0051 = await readFile(
        path.join(MIGRATIONS_DIR, '0051_review_integrity_closure.sql'),
        'utf8',
      );
      const genericCalls = parseGenericRlsCalls(sql0051);
      expect(genericCalls.column.some((call) => call.table === 'approvals')).toBe(false);
      expect(genericCalls.parent.some((call) => call.table === 'safety_toolbox_attendees')).toBe(
        false,
      );
      expect(genericCalls.column).toHaveLength(49);
      expect(genericCalls.parent).toHaveLength(24);

      let policiesBefore0051: PolicyDump[] = [];
      await client.exec('BEGIN');
      try {
        for (const tag of WAVE_TAGS) {
          await applyNamed(client, tag);
          if (tag === '0050_wave3_operations') {
            const values = [
              ...genericCalls.column.map((call) => `('${call.table}','${call.column}')`),
              ...genericCalls.parent.flatMap((call) => [
                `('${call.table}','${call.fk}')`,
                `('${call.parent}','id')`,
                `('${call.parent}','${call.parentCol}')`,
              ]),
            ].join(',\n');
            const missing = await client.query(
              `SELECT t.rel, t.col
               FROM (VALUES ${values}) AS t(rel, col)
               WHERE NOT EXISTS (
                 SELECT 1 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name = t.rel
                   AND c.column_name = t.col
               )`,
            );
            expect(missing.rows).toEqual([]);

            const approvalsProject = await client.query(
              `SELECT column_name FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'approvals'
                 AND column_name = 'project_id'`,
            );
            expect(approvalsProject.rows).toEqual([]);
            policiesBefore0051 = await dumpAuthenticatedPolicies(client);
          }
        }
        await installDrizzleJournal(
          client,
          journal.filter((entry) => tagNumber(entry.tag) <= 51),
        );
        await client.exec('COMMIT');
      } catch (error) {
        await client.exec('ROLLBACK');
        throw error;
      }

      const afterJournal = await waveApplyFlags(client, journal);
      expect(afterJournal['0046_multi_contract_projects']).toBe(true);
      expect(afterJournal['0047_notifications_and_timesheets']).toBe(true);
      expect(afterJournal['0048_document_versioning']).toBe(true);
      expect(afterJournal['0049_wave2_workflows']).toBe(true);
      expect(afterJournal['0050_wave3_operations']).toBe(true);
      expect(afterJournal['0051_review_integrity_closure']).toBe(true);

      await assertWaveSchema(client);

      const helpers = await client.query(
        `SELECT p.proname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app'
           AND p.proname IN (
             'require_relation_column',
             'can_access_approval_target',
             'and_authenticated_policy_predicate',
             'can_access_form_owner'
           )
         ORDER BY p.proname`,
      );
      expect(helpers.rows).toHaveLength(4);

      const ownerFns = await client.query(
        `SELECT p.proname, pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app'
           AND p.proname IN ('can_access_form_owner', 'can_access_document_owner')`,
      );
      const ownerDefs = Object.fromEntries(
        (ownerFns.rows as Array<{ proname: string; def: string }>).map((row) => [
          row.proname,
          row.def,
        ]),
      );
      expect(ownerDefs.can_access_form_owner).toContain('RETURN false');
      expect(ownerDefs.can_access_form_owner).not.toMatch(/NOT IN\s*\(/);
      expect(ownerDefs.can_access_document_owner).toMatch(/RETURN false;\s*END;/);
      expect(ownerDefs.can_access_document_owner).not.toMatch(
        /ELSE\s+RETURN app\.is_org_member/,
      );

      const policiesAfter0051 = await dumpAuthenticatedPolicies(client);
      const matrix = buildParityMatrix(policiesBefore0051, policiesAfter0051);
      const rewritten = rewrittenTablesFromSql(sql0051);
      const audited = matrix.filter((row) => rewritten.has(row.table));
      const weakened = matrix.filter((row) => !row.permissionPreserved);
      const bypasses = matrix.filter((row) => row.extraPermissivePolicy);
      await writeFile(
        path.resolve(process.cwd(), 'tests/integration/migration/0051-rls-parity-matrix.json'),
        JSON.stringify(
          {
            tablesChecked: [...new Set(audited.map((row) => row.table))].sort(),
            rows: audited,
          },
          null,
          2,
        ),
      );
      expect(weakened, JSON.stringify(weakened, null, 2)).toEqual([]);
      expect(bypasses, JSON.stringify(bypasses, null, 2)).toEqual([]);
      expect(audited.length).toBeGreaterThan(80);
      expect(new Set(audited.map((row) => row.table)).size).toBeGreaterThan(60);

      const roleAssignmentPolicies = await client.query(
        `SELECT polname
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'role_assignments'
         ORDER BY polname`,
      );
      const roleNames = (roleAssignmentPolicies.rows as Array<{ polname: string }>).map(
        (row) => row.polname,
      );
      expect(roleNames).toContain('role_assignments_manage_insert');
      expect(roleNames).toContain('role_assignments_manage_update');
      expect(roleNames).toContain('role_assignments_manage_delete');
      expect(roleNames).not.toContain('role_assignments_tenant_insert');
      expect(roleNames).not.toContain('role_assignments_tenant_update');
      expect(roleNames).not.toContain('role_assignments_tenant_delete');

      const assignmentInsert = await client.query(
        `SELECT pg_get_expr(polwithcheck, polrelid) AS check_expr
         FROM pg_policy
         WHERE polname = 'role_assignments_manage_insert'`,
      );
      const insertExpr = String(
        (assignmentInsert.rows[0] as { check_expr?: string } | undefined)?.check_expr ?? '',
      );
      expect(insertExpr).toContain('roles.manage');
      expect(insertExpr).toContain('org_roles_unassigned');
      expect(insertExpr).toContain('can_access_project');

      const approvalPolicy = await client.query(
        `SELECT pg_get_expr(polqual, polrelid) AS using_expr,
                pg_get_expr(polwithcheck, polrelid) AS check_expr
         FROM pg_policy
         WHERE polname LIKE 'approvals_tenant_%'
         ORDER BY polname`,
      );
      expect(approvalPolicy.rows).toHaveLength(4);
      for (const row of approvalPolicy.rows as Array<{ using_expr?: string; check_expr?: string }>) {
        const expr = `${row.using_expr ?? ''} ${row.check_expr ?? ''}`;
        expect(expr).toContain('can_access_approval_target');
        expect(expr).not.toMatch(/\bproject_id\b/);
      }

      await client.exec(`
        DO $$
        BEGIN
          PERFORM app.require_relation_column('approvals', 'project_id');
          RAISE EXCEPTION 'expected require_relation_column to fail closed';
        EXCEPTION
          WHEN others THEN
            IF SQLERRM NOT LIKE '%column public.approvals.project_id does not exist%' THEN
              RAISE;
            END IF;
        END $$;
      `);

      const approvalDefault = await client.query(
        `SELECT column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'time_entries'
           AND column_name = 'approval_status'`,
      );
      expect(String((approvalDefault.rows[0] as { column_default?: string }).column_default)).toContain('draft');
    });
  }, 120_000);

  it('locks approved time, blocks duplicate live work-order billing, and dedupes notifications', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);

      await client.exec(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_trigger WHERE tgname = 'time_entries_approval_lock'
            ) THEN
              RAISE EXCEPTION 'missing time_entries_approval_lock';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_trigger WHERE tgname = 'work_order_billing_live_guard'
            ) THEN
              RAISE EXCEPTION 'missing work_order_billing_live_guard';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_indexes WHERE indexname = 'notifications_org_recipient_dedupe_uq'
            ) THEN
              RAISE EXCEPTION 'missing notifications dedupe unique';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_indexes WHERE indexname = 'ocr_extraction_jobs_org_idempotency_uq'
            ) THEN
              RAISE EXCEPTION 'missing ocr idempotency unique';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_indexes WHERE indexname = 'project_boqs_one_active_per_contract_uq'
            ) THEN
              RAISE EXCEPTION 'missing per-contract active BOQ unique';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_indexes WHERE indexname = 'billing_records_one_live_work_order_uq'
            ) THEN
              RAISE EXCEPTION 'missing live work-order billing unique';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM pg_trigger WHERE tgname = 'time_entries_approval_lock_delete'
            ) THEN
              RAISE EXCEPTION 'missing time_entries_approval_lock_delete';
            END IF;
          END $$;

          DO $$
          DECLARE
            v_src text;
            v_definer boolean;
          BEGIN
            SELECT pg_get_functiondef(p.oid), p.prosecdef
              INTO v_src, v_definer
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.proname = 'activate_project_boq'
            LIMIT 1;
            IF v_src IS NULL OR v_src NOT LIKE '%contract_id IS NOT DISTINCT FROM%' THEN
              RAISE EXCEPTION 'activate_project_boq must supersede by contract_id';
            END IF;

            SELECT pg_get_functiondef(p.oid) INTO v_src
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.proname = 'emit_notification'
            LIMIT 1;
            IF v_src IS NULL OR v_src NOT LIKE '%recipient is not an organization member%' THEN
              RAISE EXCEPTION 'emit_notification must bind recipient to org membership';
            END IF;

            SELECT pg_get_functiondef(p.oid) INTO v_src
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.proname = 'resolve_notifications'
            LIMIT 1;
            IF v_src IS NULL
               OR v_src NOT LIKE '%recipient_user_id = v_user%'
               OR v_src LIKE '%current_user = ''service_role''%' THEN
              RAISE EXCEPTION 'resolve_notifications must not silence other recipients';
            END IF;

            SELECT p.prosecdef INTO v_definer
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.proname = 'can_access_project'
            LIMIT 1;
            IF v_definer IS DISTINCT FROM true THEN
              RAISE EXCEPTION 'can_access_project must be SECURITY DEFINER';
            END IF;
          END $$;
        `);
    });
  }, 120_000);
});
