import dotenv from 'dotenv';
import postgres from 'postgres';
import {
  buildJournalTagHashMap,
  findOutOfOrderSkippedTags,
  listPendingJournalTags,
  loadJournalEntries,
  maxAppliedCreatedAt,
} from '../drizzle/scripts/migration-approval-gate.ts';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const tags = [
  '0181_owner_bms_installment_payment_backfill',
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

const sql = postgres(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});
const entries = loadJournalEntries();
const tagToHash = buildJournalTagHashMap(entries);
const applied = await sql`
  SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
`;
const appliedHashes = new Set(applied.map((r) => r.hash));
const last = maxAppliedCreatedAt(applied);

const tagStatus = Object.fromEntries(
  tags.map((tag) => [tag, appliedHashes.has(tagToHash.get(tag) ?? '')]),
);

const objects = await sql`
  SELECT
    to_regclass('public.statutory_document_share_links') AS statutory_document_share_links,
    to_regclass('public.task_comments') AS task_comments,
    to_regclass('public.connected_contract_value_projections') AS connected_contract_value_projections,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expenses'
        AND column_name = 'paid_after_period_close'
    ) AS paid_after_period_close,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects'
        AND column_name = 'cover_image_key'
    ) AS cover_image_key
`;

const triggers = await sql`
  SELECT tgname FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname IN ('expenses', 'expense_installment_payments')
    AND NOT t.tgisinternal
    AND tgname LIKE '%closed_period%'
  ORDER BY tgname
`;

console.log(
  JSON.stringify(
    {
      appliedCount: applied.length,
      lastCreatedAt: last,
      pending: listPendingJournalTags(entries, last),
      skipped: findOutOfOrderSkippedTags(entries, applied, tagToHash),
      tagStatus,
      objects: objects[0],
      closedPeriodTriggers: triggers.map((r) => r.tgname),
    },
    null,
    2,
  ),
);
await sql.end();
