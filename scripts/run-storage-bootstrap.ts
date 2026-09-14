/**
 * Bootstrap client/project folders for an already-connected storage row (no OAuth).
 * npx tsx scripts/run-storage-bootstrap.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const orgId = '7dec19cf-ef7a-4f62-a110-615da62f3823';
const connectionId = 'ee41c00b-436f-4772-bc09-c173c7f5d9fd';
const userId = '920449ea-be4d-4445-bdbf-6563f3d2e3af';

async function main() {
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { findStorageConnectionById } = await import(
    '../src/modules/external-storage/data/connections.repository.ts'
  );
  const { loadStorageConnectionCredentials } = await import(
    '../src/modules/external-storage/data/credentials.repository.ts'
  );
  const { getStorageProviderAdapter } = await import(
    '../src/modules/external-storage/providers/registry.ts'
  );
  const { ensureOrganizationRootFolder } = await import(
    '../src/modules/external-storage/application/folder-provisioning.ts'
  );
  const { bootstrapOrganizationStorageTree } = await import(
    '../src/modules/external-storage/application/bootstrap.ts'
  );
  const { ensureUsablePrimaryStorageConnection } = await import(
    '../src/modules/external-storage/application/reconcile-primary-storage.ts'
  );

  await withUserContext(userId, async (db) => {
    await ensureUsablePrimaryStorageConnection(db, orgId, connectionId);
    const connection = await findStorageConnectionById(db, orgId, connectionId);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`Connection not ready: ${connection?.status ?? 'missing'}`);
    }

    const creds = await loadStorageConnectionCredentials(db, orgId, connectionId);
    if (!creds?.accessToken) throw new Error('Missing access token');

    let accessToken = creds.accessToken;
    const expiresAt = creds.expiresAt ? Date.parse(creds.expiresAt) : null;
    if (expiresAt !== null && expiresAt <= Date.now() + 60_000) {
      if (!creds.refreshToken) throw new Error('Token expired without refresh token');
      const adapter = getStorageProviderAdapter(connection.provider);
      const refreshed = await adapter.refreshAccessToken(creds.refreshToken);
      accessToken = refreshed.accessToken;
    }

    console.log('[bootstrap] root folder');
    await ensureOrganizationRootFolder(db, orgId, connection, accessToken);

    console.log('[bootstrap] organization tree');
    const result = await bootstrapOrganizationStorageTree(db, orgId, connectionId, accessToken);
    console.log('[bootstrap] complete', result);
  });
}

main().catch((error) => {
  console.error('[bootstrap] failed', error?.message ?? error);
  process.exit(1);
});
