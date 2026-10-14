/**
 * Align `drizzle.__drizzle_migrations` with a journal tag after out-of-band apply
 * or post-apply file hash drift. Does not execute migration SQL.
 *
 * Usage: tsx drizzle/scripts/reconcile-ledger-journal-tag.ts <journal-tag>
 */
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import postgres from 'postgres';
import {
  buildJournalTagHashMap,
  loadJournalEntries,
} from './migration-approval-gate';

async function main(): Promise<void> {
  const tag = process.argv[2]?.trim();
  if (!tag) {
    console.error('Usage: tsx drizzle/scripts/reconcile-ledger-journal-tag.ts <journal-tag>');
    process.exitCode = 1;
    return;
  }

  const entries = loadJournalEntries();
  const journalEntry = entries.find((entry) => entry.tag === tag);
  if (!journalEntry) {
    console.error(`Tag not in journal: ${tag}`);
    process.exitCode = 1;
    return;
  }

  const tagToHash = buildJournalTagHashMap(entries);
  const hash = tagToHash.get(tag);
  if (!hash) {
    console.error(`No hash for tag: ${tag}`);
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('No DIRECT_DATABASE_URL or DATABASE_URL');
    process.exitCode = 1;
    return;
  }

  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const result = await client.begin(async (tx) => {
      const existing = await tx`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        WHERE created_at = ${journalEntry.when}
      `;

      if (existing.length === 0) {
        const inserted = await tx`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${journalEntry.when})
          RETURNING id, hash, created_at
        `;
        return { action: 'insert', row: inserted[0] };
      }

      if (existing.length > 1) {
        throw new Error(
          `Multiple ledger rows for created_at=${journalEntry.when}; resolve manually before reconcile.`,
        );
      }

      const row = existing[0]!;
      if (row.hash === hash) {
        return { action: 'unchanged', row };
      }

      const updated = await tx`
        UPDATE drizzle.__drizzle_migrations
        SET hash = ${hash}
        WHERE id = ${row.id}
        RETURNING id, hash, created_at
      `;
      return { action: 'update_hash', before: row, row: updated[0] };
    });

    console.log(JSON.stringify({ tag, when: journalEntry.when, hash, ...result }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
