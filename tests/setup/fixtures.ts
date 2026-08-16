import { randomUUID } from 'node:crypto';
import { profiles } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { createOrganization } from '@/modules/tenancy';
import type { OrganizationSummary } from '@/shared/auth/context';
import type { TestDatabase } from './database';

/**
 * Fixture builders for integration tests.
 *
 * Profiles are inserted with the service handle because Supabase Auth normally
 * creates the underlying identity. Everything else runs through the real use
 * cases as the acting user, so the tests exercise the same RLS path as
 * production rather than a privileged shortcut.
 */

export interface TestUser {
  readonly id: string;
  readonly email: string;
}

export async function seedSystem(database: TestDatabase): Promise<void> {
  await database.asService(async (db) => {
    await seedSystemData(db);
  });
}

export async function createTestUser(database: TestDatabase, email?: string): Promise<TestUser> {
  const id = randomUUID();
  const address = email ?? `user-${id.slice(0, 8)}@example.test`;

  await database.asService(async (db) => {
    await db.insert(profiles).values({ id, email: address, displayName: address.split('@')[0]! });
  });

  return { id, email: address };
}

export interface TestOrganization {
  readonly organization: OrganizationSummary;
  readonly membershipId: string;
  readonly owner: TestUser;
}

export async function createTestOrganization(
  database: TestDatabase,
  owner: TestUser,
  name: string,
): Promise<TestOrganization> {
  const result = await database.asUser(owner.id, async (tx) =>
    createOrganization(tx, owner.id, { name, countryCode: 'IL' }),
  );

  return { organization: result.organization, membershipId: result.membershipId, owner };
}

/** Two fully provisioned, unrelated tenants - the standard isolation scenario. */
export interface TwoTenantScenario {
  readonly orgA: TestOrganization;
  readonly orgB: TestOrganization;
  readonly userA: TestUser;
  readonly userB: TestUser;
}

export async function createTwoTenantScenario(database: TestDatabase): Promise<TwoTenantScenario> {
  await seedSystem(database);

  const userA = await createTestUser(database, 'owner-a@example.test');
  const userB = await createTestUser(database, 'owner-b@example.test');

  const orgA = await createTestOrganization(database, userA, 'Alpha Electrical');
  const orgB = await createTestOrganization(database, userB, 'Beta Construction');

  return { orgA, orgB, userA, userB };
}
