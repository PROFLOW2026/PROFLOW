import { beforeAll, describe, expect, it } from 'vitest';
import { organizationMemberships, organizations, roles } from '@drizzle/schema';
import { eq } from 'drizzle-orm';
import { createOrganization, listMembershipsForUser, resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { createTestUser, createTwoTenantScenario, seedSystem } from '../../setup/fixtures';

/**
 * The founding path is the one flow that runs before any membership exists, so
 * it is the only place where row-level security has nothing to authorise
 * against yet. It has to be exercised as a real authenticated user — running it
 * as the service role would prove nothing.
 */
describe('founding an organization as an authenticated user', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  });

  it('succeeds end to end under row-level security', async () => {
    const founder = await createTestUser(database, 'founder@example.test');

    const result = await database.asUser(founder.id, async (tx) =>
      createOrganization(tx, founder.id, { name: 'Levi Electrical', countryCode: 'IL' }),
    );

    expect(result.organization.name).toBe('Levi Electrical');
    // Country defaults must be applied, since onboarding never asks for them.
    expect(result.organization.baseCurrency).toBe('ILS');
    expect(result.organization.timezone).toBe('Asia/Jerusalem');
    expect(result.membershipId).toBeTruthy();
  });

  it('leaves the founder able to read the organization back immediately', async () => {
    const founder = await createTestUser(database, 'founder-2@example.test');

    const { organization } = await database.asUser(founder.id, async (tx) =>
      createOrganization(tx, founder.id, { name: 'Cohen Plumbing', countryCode: 'IL' }),
    );

    const memberships = await database.asUser(founder.id, async (tx) =>
      listMembershipsForUser(tx, founder.id),
    );

    expect(memberships.map((membership) => membership.id)).toContain(organization.id);
  });

  it('provisions roles and an owner grant in the same transaction', async () => {
    const founder = await createTestUser(database, 'founder-3@example.test');

    const { organization } = await database.asUser(founder.id, async (tx) =>
      createOrganization(tx, founder.id, { name: 'Mizrahi Renovations', countryCode: 'IL' }),
    );

    const context = await database.asUser(founder.id, async (tx) =>
      resolveOrgContext(tx, {
        userId: founder.id,
        organizationId: organization.id,
        locale: 'he-IL',
      }),
    );

    expect(context.roleKeys).toContain('owner');
    // An owner with no permissions would leave the tenant unadministrable.
    expect(context.permissions.size).toBeGreaterThan(20);

    const provisioned = await database.asService(async (db) =>
      resultRows(await db.select().from(roles).where(eq(roles.organizationId, organization.id))),
    );
    expect(provisioned).toHaveLength(4);
  });

  it('never leaves a member-less organization behind for others to see', async () => {
    const founder = await createTestUser(database, 'founder-4@example.test');
    const stranger = await createTestUser(database, 'stranger@example.test');

    await database.asUser(founder.id, async (tx) =>
      createOrganization(tx, founder.id, { name: 'Private Works', countryCode: 'IL' }),
    );

    const visible = await database.asUser(stranger.id, async (tx) =>
      resultRows(await tx.select({ id: organizations.id }).from(organizations)),
    );
    expect(visible).toHaveLength(0);

    const orphaned = await database.asService(async (db) => {
      const all = resultRows<{ id: string }>(
        await db.select({ id: organizations.id }).from(organizations),
      );
      const members = resultRows<{ organizationId: string }>(
        await db
          .select({ organizationId: organizationMemberships.organizationId })
          .from(organizationMemberships),
      );
      const withMembers = new Set(members.map((row) => row.organizationId));
      return all.filter((row) => !withMembers.has(row.id));
    });
    expect(orphaned).toHaveLength(0);
  });
});

describe('two-tenant fixture', () => {
  it('provisions both tenants through the real authenticated path', async () => {
    const database = await createTestDatabase();
    const scenario = await createTwoTenantScenario(database);

    expect(scenario.orgA.organization.id).not.toBe(scenario.orgB.organization.id);

    // Each owner sees exactly their own organization and nothing else.
    const aSees = await database.asUser(scenario.userA.id, async (tx) =>
      listMembershipsForUser(tx, scenario.userA.id),
    );
    expect(aSees.map((row) => row.id)).toEqual([scenario.orgA.organization.id]);

    await expect(
      database.asUser(scenario.userA.id, async (tx) =>
        resolveOrgContext(tx, {
          userId: scenario.userA.id,
          organizationId: scenario.orgB.organization.id,
          locale: 'he-IL',
        }),
      ),
    ).rejects.toThrow();
  });
});
