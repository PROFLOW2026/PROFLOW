import dotenv from 'dotenv';
import postgres from 'postgres';
import {
  buildJournalTagHashMap,
  findOutOfOrderSkippedTags,
  loadJournalEntries,
  listPendingJournalTags,
  maxAppliedCreatedAt,
  evaluateMigrationApprovalGate,
} from '../drizzle/scripts/migration-approval-gate.ts';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const sql = postgres(url, { max: 1, prepare: false });
const entries = loadJournalEntries();
const tagToHash = buildJournalTagHashMap(entries);
const applied = await sql`
  SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
`;
const last = maxAppliedCreatedAt(applied);
const skipped = findOutOfOrderSkippedTags(entries, applied, tagToHash);
const pending = listPendingJournalTags(entries, last);
const gateTags =
  '0183_expense_installment_payments_rls_permissions,0184_crm_permission_rls,0185_rls_0009_0011_sibling_tables,0186_contract_value_events_rls_and_0174_grants,0187_statutory_document_share_links,0188_task_collaboration,0189_expenses_closed_period_guard_payment_columns,0190_connected_contract_value_projections,0191_project_cover_image,0192_inventory_rls';

console.log(
  JSON.stringify(
    {
      appliedCount: applied.length,
      lastCreatedAt: last,
      skipped,
      pending,
      gateBefore0181Fix: evaluateMigrationApprovalGate({
        journalEntries: entries,
        appliedRows: applied,
        tagToHash,
        approvedTagsRaw: gateTags,
        appEnv: 'production',
        ownerApprovedFlag: '2026-10-14',
      }),
    },
    null,
    2,
  ),
);
await sql.end();
