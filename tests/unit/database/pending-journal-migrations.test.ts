import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const JOURNAL_PATH = path.resolve(process.cwd(), 'drizzle/migrations/meta/_journal.json');

const EXPECTED_PENDING_JOURNAL_TAGS = [
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
] as const;

async function loadJournalTags(): Promise<Set<string>> {
  const journal = JSON.parse(await readFile(JOURNAL_PATH, 'utf8')) as {
    entries: { tag: string }[];
  };
  return new Set(journal.entries.map((entry) => entry.tag));
}

describe('drizzle/migrations pending journal files (§9.4 / O02)', () => {
  it('Gate B SQL files 0183–0192 are listed in the journal after Owner apply', async () => {
    const journalTags = await loadJournalTags();
    for (const tag of EXPECTED_PENDING_JOURNAL_TAGS) {
      expect(journalTags.has(tag), `${tag} must be in journal after Gate B apply`).toBe(true);
    }
  });

  it('contains pending migration SQL 0183–0192 under drizzle/migrations/', async () => {
    const migrationFiles = new Set(await readdir(MIGRATIONS_DIR));
    for (const tag of EXPECTED_PENDING_JOURNAL_TAGS) {
      expect(migrationFiles.has(`${tag}.sql`), `missing ${tag}.sql`).toBe(true);
    }
  });

  it('does not use a drizzle/prepared directory', async () => {
    const entries = await readdir(path.resolve(process.cwd(), 'drizzle'));
    expect(entries.includes('prepared')).toBe(false);
  });
});
