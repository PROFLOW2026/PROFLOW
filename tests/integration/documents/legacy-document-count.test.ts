import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { documents } from '@drizzle/schema';
import { countLegacyDocuments } from '@/modules/documents/application/legacy-document-count';
import { createOrganization } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

vi.mock('server-only', () => ({}));

describe('countLegacyDocuments (M12-001 / O03)', () => {
  let database: TestDatabase;
  let organizationId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    const owner = await createTestUser(database, 'legacy-count@example.com');
    const created = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Legacy Count Org', countryCode: 'IL' }),
    );
    organizationId = created.organization.id;
  });

  async function insertDocument(input: {
    storageBackend: 'supabase_legacy' | 'external';
    status?: string;
    deletedAt?: Date | null;
  }) {
    await database.asService(async (db) => {
      await db.insert(documents).values({
        id: randomUUID(),
        organizationId,
        storageBackend: input.storageBackend,
        storageBucket: 'documents',
        storagePath: `${organizationId}/docs/${randomUUID()}.pdf`,
        originalFilename: 'doc.pdf',
        mimeType: 'application/pdf',
        status: (input.status ?? 'available') as 'available' | 'pending' | 'deleted',
        deletedAt: input.deletedAt ?? null,
      });
    });
  }

  it('counts non-deleted rows on supabase_legacy only', async () => {
    await insertDocument({ storageBackend: 'supabase_legacy' });
    await insertDocument({ storageBackend: 'supabase_legacy' });
    await insertDocument({ storageBackend: 'supabase_legacy', status: 'deleted' });
    await insertDocument({
      storageBackend: 'supabase_legacy',
      deletedAt: new Date(),
    });
    await insertDocument({ storageBackend: 'external' });

    const count = await database.asService(async (db) => countLegacyDocuments(db));

    expect(count).toBe(2);
  });

  it('returns zero when no legacy rows remain', async () => {
    await insertDocument({ storageBackend: 'external' });

    const count = await database.asService(async (db) => countLegacyDocuments(db));

    expect(count).toBe(0);
  });
});
