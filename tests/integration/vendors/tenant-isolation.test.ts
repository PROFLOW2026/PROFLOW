import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrganization } from '@/modules/tenancy';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor, getVendorById, listVendorsForOrg } from '@/modules/vendors';
import { AuthorizationError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

async function provisionTenant(database: TestDatabase, email: string, orgName: string) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: orgName, countryCode: 'IL' }),
  );
  return { owner, organizationId: result.organization.id };
}

describe('vendors tenant isolation', () => {
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

  it('prevents organization B from reading organization A vendors', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    const vendor = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organizationId,
        locale: 'en',
      });
      return createVendor(context, { name: 'ABC Electrical Supplies' });
    });

    await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });

      const list = await listVendorsForOrg(context);
      expect(list).toHaveLength(0);

      await expect(getVendorById(context, vendor.id)).rejects.toThrow();
    });
  });

  it('prevents cross-tenant vendor creation without membership in another org', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    await expect(
      database.asUser(orgB.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgB.owner.id,
          organizationId: orgA.organizationId,
          locale: 'en',
        });
        return createVendor(context, { name: 'Intruder Vendor' });
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
