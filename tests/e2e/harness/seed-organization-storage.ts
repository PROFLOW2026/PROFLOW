import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { organizationStorageConnections } from '@drizzle/schema';
import { sealOAuthPayload } from '@/modules/external-storage/application/token-seal';
import type { Database } from '@/shared/db/types';
import { E2E_STORAGE_TOKEN_ENCRYPTION_KEY } from './config';

/**
 * Same connected-org row as seedOrganizationStorageConnection in
 * tests/setup/external-storage-fixture.ts. Playwright cannot import that
 * module because it loads Vitest. No live OAuth: a sealed dummy token plus
 * the in-process Graph stand-in in e2e-graph-storage-hook.mjs.
 */
export const E2E_STORAGE_ROOT_FOLDER_ID = 'e2e-projectflow-root';
export const E2E_STORAGE_ACCESS_TOKEN = 'e2e-storage-access-token';

export async function seedE2eOrganizationStorage(
  db: Database,
  organizationId: string,
  connectedByUserId: string,
): Promise<string> {
  if (!process.env.STORAGE_TOKEN_ENCRYPTION_KEY) {
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY = E2E_STORAGE_TOKEN_ENCRYPTION_KEY;
  }

  const connectionId = randomUUID();
  const expiresAt = new Date('2099-01-01T00:00:00.000Z');
  await db.insert(organizationStorageConnections).values({
    id: connectionId,
    organizationId,
    provider: 'onedrive',
    status: 'connected',
    isPrimary: true,
    externalAccountId: 'integration-test-account',
    externalAccountName: 'Integration Test',
    externalAccountEmail: 'storage-integration@test.example',
    rootFolderExternalId: E2E_STORAGE_ROOT_FOLDER_ID,
    rootFolderName: 'ProjectFlow',
    scopesJson: [],
    connectedByUserId,
    connectedAt: new Date(),
    lastValidatedAt: new Date(),
    tokenExpiresAt: expiresAt,
  });

  const sealed = sealOAuthPayload({
    accessToken: E2E_STORAGE_ACCESS_TOKEN,
    refreshToken: null,
    expiresAt: expiresAt.toISOString(),
    scopes: [],
  });
  await db.execute(sql`
    INSERT INTO app.storage_connection_credential_refs (
      organization_id, connection_id, credentials_ref, token_expires_at
    ) VALUES (
      ${organizationId}::uuid,
      ${connectionId}::uuid,
      ${sealed},
      ${expiresAt.toISOString()}::timestamptz
    )
  `);
  return connectionId;
}
