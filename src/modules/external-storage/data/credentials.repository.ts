import 'server-only';

import { sql } from 'drizzle-orm';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';
import { openOAuthPayload, sealOAuthPayload, type StoredOAuthPayload } from '../application/token-seal';
import { runCommittedStorageWrite } from './storage-admin-write';

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function toTimestamptzParam(value: Date | null): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

async function writeStorageConnectionCredentials(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    payload: StoredOAuthPayload;
    tokenExpiresAt: Date | null;
  },
): Promise<void> {
  const sealed = sealOAuthPayload(input.payload);
  const tokenExpiresAt = toTimestamptzParam(input.tokenExpiresAt);
  await db.execute(sql`
    INSERT INTO app.storage_connection_credential_refs (
      organization_id, connection_id, credentials_ref, token_expires_at
    ) VALUES (
      ${input.organizationId}::uuid,
      ${input.connectionId}::uuid,
      ${sealed},
      ${tokenExpiresAt}
    )
    ON CONFLICT (connection_id) DO UPDATE SET
      credentials_ref = EXCLUDED.credentials_ref,
      token_expires_at = EXCLUDED.token_expires_at,
      updated_at = now()
  `);
}

/** Persists credentials in a committed admin transaction (survives request tx rollback). */
export async function saveStorageConnectionCredentials(
  _db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    payload: StoredOAuthPayload;
    tokenExpiresAt: Date | null;
  },
): Promise<void> {
  await runCommittedStorageWrite((adminDb) => writeStorageConnectionCredentials(adminDb, input));
}

export async function loadStorageConnectionCredentials(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<StoredOAuthPayload | null> {
  return asServiceRoleWrite(db, async () => {
    const result = await db.execute(sql`
      SELECT credentials_ref
      FROM app.storage_connection_credential_refs
      WHERE organization_id = ${organizationId}::uuid
        AND connection_id = ${connectionId}::uuid
      LIMIT 1
    `);
    const row = sqlResultRows<{ credentials_ref: string }>(result)[0];
    if (!row?.credentials_ref) return null;
    return openOAuthPayload(row.credentials_ref);
  });
}

export async function deleteStorageConnectionCredentials(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<void> {
  await asServiceRoleWrite(db, async () => {
    await db.execute(sql`
      DELETE FROM app.storage_connection_credential_refs
      WHERE organization_id = ${organizationId}::uuid
        AND connection_id = ${connectionId}::uuid
    `);
  });
}
