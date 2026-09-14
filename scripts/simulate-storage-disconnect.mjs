/**
 * Simulate disconnectStorageConnection DB effects (no OAuth).
 * Verifies upload gate + primary reconciliation after disconnect.
 *
 * Usage:
 *   node scripts/simulate-storage-disconnect.mjs
 *   node scripts/simulate-storage-disconnect.mjs --restore
 *
 * Env: DATABASE_URL (.env.local). Optional ORG_ID / CONNECTION_ID overrides.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: '.env.local' });

const ORG_ID = process.env.ORG_ID?.trim() || '7dec19cf-ef7a-4f62-a110-615da62f3823';
const CONNECTION_ID = process.env.CONNECTION_ID?.trim() || 'ee41c00b-436f-4772-bc09-c173c7f5d9fd';
const restore = process.argv.includes('--restore');
const BACKUP_PATH = join(dirname(fileURLToPath(import.meta.url)), '.storage-disconnect-backup.json');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function snapshot() {
  const [connection] = await sql`
    SELECT id, status, is_primary, root_folder_external_id, external_account_email, last_error
    FROM organization_storage_connections
    WHERE id = ${CONNECTION_ID}::uuid AND organization_id = ${ORG_ID}::uuid
    LIMIT 1
  `;
  const [credential] = await sql`
    SELECT connection_id, token_expires_at
    FROM app.storage_connection_credential_refs
    WHERE connection_id = ${CONNECTION_ID}::uuid
    LIMIT 1
  `;
  const [mappingCount] = await sql`
    SELECT COUNT(*)::int AS count
    FROM storage_folder_mappings
    WHERE connection_id = ${CONNECTION_ID}::uuid
  `;
  const [primary] = await sql`
    SELECT id, provider, status, is_primary, root_folder_external_id
    FROM organization_storage_connections
    WHERE organization_id = ${ORG_ID}::uuid AND is_primary = true
    LIMIT 1
  `;
  return { connection, credential, mappingCount: mappingCount?.count ?? 0, primary };
}

if (restore) {
  if (!existsSync(BACKUP_PATH)) {
    console.error('No backup found — run simulate without --restore first');
    await sql.end();
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf8'));
  const before = await snapshot();
  if (backup.credentials_ref) {
    await sql`
      INSERT INTO app.storage_connection_credential_refs (
        organization_id, connection_id, credentials_ref, token_expires_at, created_at, updated_at
      ) VALUES (
        ${ORG_ID}::uuid, ${CONNECTION_ID}::uuid, ${backup.credentials_ref},
        ${backup.token_expires_at ? new Date(backup.token_expires_at) : null}, now(), now()
      )
      ON CONFLICT (connection_id) DO UPDATE SET
        credentials_ref = EXCLUDED.credentials_ref,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = now()
    `;
  }
  await sql`
    UPDATE organization_storage_connections
    SET status = 'connected',
        is_primary = true,
        last_error = null,
        token_expires_at = ${backup.token_expires_at ? new Date(backup.token_expires_at) : null},
        updated_at = now()
    WHERE id = ${CONNECTION_ID}::uuid AND organization_id = ${ORG_ID}::uuid
  `;
  const after = await snapshot();
  console.log(JSON.stringify({ action: 'restore_connected_primary', before, after }, null, 2));
  await sql.end();
  process.exit(after.credential && after.connection?.status === 'connected' ? 0 : 1);
}

const before = await snapshot();
if (!before.connection) {
  console.error('Connection not found');
  await sql.end();
  process.exit(1);
}

const [credRow] = await sql`
  SELECT credentials_ref, token_expires_at
  FROM app.storage_connection_credential_refs
  WHERE organization_id = ${ORG_ID}::uuid AND connection_id = ${CONNECTION_ID}::uuid
  LIMIT 1
`;
writeFileSync(
  BACKUP_PATH,
  JSON.stringify({
    organization_id: ORG_ID,
    connection_id: CONNECTION_ID,
    credentials_ref: credRow?.credentials_ref ?? null,
    token_expires_at: credRow?.token_expires_at ?? null,
    saved_at: new Date().toISOString(),
  }),
);
await sql`
  DELETE FROM app.storage_connection_credential_refs
  WHERE organization_id = ${ORG_ID}::uuid AND connection_id = ${CONNECTION_ID}::uuid
`;
await sql`
  UPDATE organization_storage_connections
  SET status = 'disconnected',
      is_primary = false,
      token_expires_at = null,
      last_error = null,
      updated_at = now()
  WHERE id = ${CONNECTION_ID}::uuid AND organization_id = ${ORG_ID}::uuid
`;

const after = await snapshot();
const uploadBlocked =
  after.connection?.status === 'disconnected' ||
  !after.credential ||
  !after.primary?.root_folder_external_id;

console.log(
  JSON.stringify(
    {
      action: 'simulate_disconnect',
      before,
      after,
      checks: {
        credentialsRemoved: !after.credential,
        statusDisconnected: after.connection?.status === 'disconnected',
        primaryClearedOnRow: after.connection?.is_primary === false,
        mappingsPreserved: after.mappingCount === before.mappingCount,
        uploadBlocked,
      },
      nextSteps: [
        'Reconnect via Settings → Storage (OAuth) OR restore with --restore',
        'After reconnect: node scripts/verify-token-refresh.mjs',
        'Verify storage: node scripts/verify-token-refresh.mjs',
      ],
    },
    null,
    2,
  ),
);

await sql.end();
process.exit(uploadBlocked ? 0 : 1);
