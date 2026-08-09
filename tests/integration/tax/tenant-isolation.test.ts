import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { profiles } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { resolveOrgContext } from '@/modules/tenancy';
import { createOrganization } from '@/modules/tenancy';
import { listTaxRules } from '@/modules/tax';
import { AuthorizationError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

async function seedTwoTenants(database: TestDatabase) {
  await database.asService(async (db) => {
    await seedSystemData(db);
  });

  const userA = randomUUID();
  const userB = randomUUID();

  await database.asService(async (db) => {
    await db.insert(profiles).values([
      { id: userA, email: 'owner-a@example.test', displayName: 'Owner A' },
      { id: userB, email: 'owner-b@example.test', displayName: 'Owner B' },
    ]);
  });

  const orgA = await database.asService(async (db) =>
    createOrganization(db, userA, { name: 'Alpha Electrical', countryCode: 'IL' }),
  );

  await database.asService(async (db) =>
    createOrganization(db, userB, { name: 'Beta Construction', countryCode: 'IL' }),
  );

  return { userA, userB, orgA };
}

describe('tax tenant isolation', () => {
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

  it('does not expose another organization tax rules through OrgContext', async () => {
    const { userA, userB, orgA } = await seedTwoTenants(database);

    const orgARules = await database.asUser(userA, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listTaxRules(context);
    });

    await expect(
      database.asUser(userB, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return listTaxRules(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(orgARules.some((rule) => rule.countryCode === 'IL')).toBe(true);
  });
});
