/**
 * EB-1 — Production read-only migration / dependency probe (SELECT only).
 * Owner-approved; do not run migrate or DML.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import postgres from 'postgres';
import {
  buildJournalTagHashMap,
  findOutOfOrderSkippedTags,
  loadJournalEntries,
} from '../drizzle/scripts/migration-approval-gate.ts';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('NO_DB_URL');
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    return 'unknown';
  }
})();

const MIGRATIONS_DIR = path.resolve('drizzle/migrations');
const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries ?? [];

function fileHash(tag) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  return createHash('sha256').update(sql).digest('hex');
}

const tagToHash = new Map(entries.map((e) => [e.tag, fileHash(e.tag)]));
const focusTags = [
  '0174_audit_events_contracts_select_rls',
  '0177_tasks_uwm_scale_indexes',
  '0178_contractor_username_org_update',
  '0179_connected_projects',
  '0180_expense_installment_payments',
  '0181_owner_bms_installment_payment_backfill',
  '0182_expense_installment_payments_grants',
];

const gateBTags = [
  '0183_expense_installment_payments_rls_permissions',
  '0184_crm_permission_rls',
  '0185_rls_0009_0011_sibling_tables',
  '0186_contract_value_events_rls_and_0174_grants',
  '0187_statutory_document_share_links',
  '0188_task_collaboration',
  '0189_expenses_closed_period_guard_payment_columns',
  '0190_connected_contract_value_projections',
  '0191_project_cover_image',
  '0192_inventory_rls',
];

const sql = postgres(url, { max: 1, prepare: false });

try {
  const applied = await sql`
    SELECT hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at ASC
  `;
  const appliedHashes = new Set(applied.map((r) => r.hash));

  const tagApplied = (tag) => {
    const h = tagToHash.get(tag);
    return h ? appliedHashes.has(h) : false;
  };

  const last = applied.at(-1);
  const lastTag = [...tagToHash.entries()].find(([, h]) => h === last?.hash)?.[0] ?? null;

  const objects = await sql`
    SELECT
      to_regclass('public.connected_project_mappings') AS connected_project_mappings,
      to_regclass('public.cross_org_sync_outbox') AS cross_org_sync_outbox,
      to_regclass('public.expense_installment_payments') AS expense_installment_payments,
      to_regclass('public.expense_installment_payment_ledger') AS expense_installment_payment_ledger,
      to_regclass('public.statutory_document_share_links') AS statutory_document_share_links,
      to_regclass('public.task_comment_mentions') AS task_comment_mentions,
      to_regclass('public.connected_contract_value_projections') AS connected_contract_value_projections
  `;

  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name IN ('paid_after_period_close')
  `;

  const triggers = await sql`
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'expenses'
      AND NOT t.tgisinternal
      AND tgname IN ('expenses_closed_period_guard', 'closed_period_rewrite_guard')
  `;

  const funcs = await sql`
    SELECT proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND proname IN (
        'uwm_has_permission',
        'uwm_can_access_project_context',
        'has_org_permission',
        'expenses_closed_period_guard_v2'
      )
  `;

  const policies0174 = await sql`
    SELECT polname, c.relname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('audit_events', 'contracts')
      AND polname IN ('audit_events_member_select', 'contracts_tenant_select')
  `;

  const ledgerCount = await sql`
    SELECT count(*)::int AS n FROM public.expense_installment_payment_ledger
  `.catch(() => [{ n: null }]);

  const installmentCount = await sql`
    SELECT count(*)::int AS n FROM public.expense_installment_payments
  `.catch(() => [{ n: null }]);

  const bmsBackfillProbe = await sql`
    SELECT count(*)::int AS void_events
    FROM audit_events
    WHERE action = 'expense.payment_confirmation_voided'
      AND entity_id = 'bbd3cdce-22e5-477f-bae1-1161e87cacb6'::uuid
  `.catch(() => [{ void_events: null }]);

  const forceRls = await sql`
    SELECT c.relname, c.relforcerowsecurity AS force_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'employee_month_costs',
        'inventory_items',
        'inventory_movements'
      )
  `;

  const skippedJournalTags = findOutOfOrderSkippedTags(entries, applied, tagToHash);

  console.log(
    JSON.stringify(
      {
        eb1: true,
        databaseHost: host,
        skippedJournalTags,
        appliedMigrationCount: applied.length,
        lastAppliedHash: last?.hash ?? null,
        lastAppliedCreatedAt: last?.created_at ?? null,
        lastAppliedTagInferred: lastTag,
        focusTagsApplied: Object.fromEntries(focusTags.map((t) => [t, tagApplied(t)])),
        gateBTagsApplied: Object.fromEntries(gateBTags.map((t) => [t, false])),
        objects: objects[0],
        expensesPaidAfterPeriodCloseColumn: columns.length > 0,
        expenseTriggers: triggers.map((r) => r.tgname),
        appFunctions: funcs.map((r) => r.proname).sort(),
        policies0174Sample: policies0174.map((r) => `${r.relname}:${r.polname}`),
        ledgerRowCount: ledgerCount[0]?.n ?? null,
        installmentPaymentRowCount: installmentCount[0]?.n ?? null,
        bms0181VoidAuditCount: bmsBackfillProbe[0]?.void_events ?? null,
        forceRlsSample: forceRls,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
