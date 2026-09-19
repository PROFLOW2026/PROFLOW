import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@/modules/clients';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { resolveGeneratedDocumentBinding } from '@/modules/generated-documents/application/resolve-binding';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

describe('customer_statement generated document binding', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('resolves client-scoped storage binding from client id', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'binding-owner@example.test');
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Binding Test Org', countryCode: 'IL' }),
    );

    const clientId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'he-IL',
      });
      const client = await createClient(context, { name: 'Demo Client' });
      return client.id;
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'he-IL',
      });

      const binding = await resolveGeneratedDocumentBinding(context, 'customer_statement', clientId);
      expect(binding.ownerType).toBe('client');
      expect(binding.ownerId).toBe(clientId);
      expect(binding.sourceEntityType).toBe('client');
      expect(binding.sourceEntityId).toBe(clientId);
      expect(binding.semanticFolder).toBe('client_root');
    });
  });
});
