import dotenv from 'dotenv';

// `.env.local` overrides `.env` — matches Next.js / Owner workstation layout.
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {
  buildJournalTagHashMap,
  evaluateMigrationApprovalGate,
  loadJournalEntries,
  parseOwnerApprovedFlag,
  type AppliedMigrationRow,
} from './migration-approval-gate';

/**
 * Controlled migration runner (doc 77 §1).
 *
 * `drizzle-kit push` is deliberately not part of any deployment path: schema
 * changes reach an environment only through the reviewed SQL files in
 * `drizzle/migrations`.
 *
 * Gate B approval (§9.4 / O02): pending journal tags must match
 * `MIGRATION_APPROVED_TAGS` exactly before Drizzle writes anything.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      'No DIRECT_DATABASE_URL or DATABASE_URL configured.\n' +
        'Copy .env.example to .env.local and point it at a non-production database.',
    );
    process.exitCode = 1;
    return;
  }

  // Migrations need a direct, non-pooled, single connection.
  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const journalEntries = loadJournalEntries();
    const tagToHash = buildJournalTagHashMap(journalEntries);

    const appliedRows = await client<AppliedMigrationRow[]>`
      SELECT hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at ASC
    `;

    const gate = evaluateMigrationApprovalGate({
      journalEntries,
      appliedRows,
      tagToHash,
      approvedTagsRaw: process.env.MIGRATION_APPROVED_TAGS,
      appEnv: process.env.APP_ENV,
      ownerApprovedFlag: parseOwnerApprovedFlag(process.argv),
    });

    if (gate.pendingTags.length > 0) {
      console.log(`Pending journal migrations: ${gate.pendingTags.join(', ')}`);
    } else {
      console.log('Pending journal migrations: (none)');
    }

    if (!gate.ok) {
      console.error(gate.message);
      process.exitCode = 1;
      return;
    }

    console.log(`Applying migrations (APP_ENV=${process.env.APP_ENV ?? 'local'})…`);
    await migrate(drizzle(client), { migrationsFolder: './drizzle/migrations' });
    console.log('Migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
