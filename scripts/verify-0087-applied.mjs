import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const mig0087 = readFileSync('drizzle/migrations/0087_external_organization_storage.sql', 'utf8');
const hash0087 = createHash('sha256').update(mig0087).digest('hex');

const journal = await sql`
  SELECT id, hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash0087}
`;

const tables = await sql`
  SELECT
    to_regclass('public.organization_storage_connections')::text AS organization_storage_connections,
    to_regclass('public.storage_folder_mappings')::text AS storage_folder_mappings,
    to_regclass('public.storage_files')::text AS storage_files,
    to_regclass('app.storage_connection_credential_refs')::text AS storage_connection_credential_refs
`;

const docCols = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'documents'
    AND column_name IN (
      'storage_backend',
      'external_connection_id',
      'external_file_id',
      'external_parent_folder_id',
      'external_etag'
    )
  ORDER BY column_name
`;

const checks = {
  migrationInJournal: journal.length > 0,
  migrationJournalEntry: journal[0] ?? null,
  organization_storage_connections: tables[0].organization_storage_connections !== null,
  storage_folder_mappings: tables[0].storage_folder_mappings !== null,
  storage_files: tables[0].storage_files !== null,
  storage_connection_credential_refs: tables[0].storage_connection_credential_refs !== null,
  documentsExternalColumns: docCols.map((r) => r.column_name),
  documentsExternalColumnsComplete: docCols.length === 5,
};

checks.allPass =
  checks.migrationInJournal &&
  checks.organization_storage_connections &&
  checks.storage_folder_mappings &&
  checks.storage_files &&
  checks.storage_connection_credential_refs &&
  checks.documentsExternalColumnsComplete;

console.log(JSON.stringify(checks, null, 2));
await sql.end();
process.exit(checks.allPass ? 0 : 1);
