import { randomUUID } from 'node:crypto';
import { createOrganization } from '@/modules/tenancy';
import type { OrganizationSummary } from '@/shared/auth/context';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';
import type { TestDatabase } from '@tests/setup/database';

export interface ProvisionedTenant {
  readonly organization: OrganizationSummary;
  readonly owner: TestUser;
}

/** Provisions a tenant via the service role because PGlite RLS blocks org insert as authenticated. */
export async function provisionTenant(
  database: TestDatabase,
  owner: TestUser,
  name: string,
): Promise<ProvisionedTenant> {
  const result = await database.asService(async (db) => {
    const organization = await createOrganization(db, owner.id, { name, countryCode: 'IL' });
    return organization.organization;
  });

  return { organization: result, owner };
}

export async function provisionTwoTenants(database: TestDatabase): Promise<{
  orgA: ProvisionedTenant;
  orgB: ProvisionedTenant;
  userA: TestUser;
  userB: TestUser;
}> {
  await seedSystem(database);

  const userA = await createTestUser(database, 'owner-a@example.test');
  const userB = await createTestUser(database, 'owner-b@example.test');

  const orgA = await provisionTenant(database, userA, 'Alpha Electrical');
  const orgB = await provisionTenant(database, userB, 'Beta Construction');

  return { orgA, orgB, userA, userB };
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}
