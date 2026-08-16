import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { auditEvents } from '@drizzle/schema';
import { listOrganizationMembers, resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTwoTenantScenario } from '../../setup/fixtures';
import { listAuditEvents } from '@/app/[locale]/(app)/settings/_lib/audit';

/**
 * Tenants are provisioned through the shared fixture, which founds each
 * organization as a real authenticated user - the same path production takes.
 */
async function seedTwoTenants(database: TestDatabase) {
  const scenario = await createTwoTenantScenario(database);

  return {
    userA: scenario.userA.id,
    userB: scenario.userB.id,
    orgA: { organization: scenario.orgA.organization },
    orgB: { organization: scenario.orgB.organization },
  };
}

describe('settings tenant isolation', () => {
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

  it('rejects a user who is not a member of the target organization (members list)', async () => {
    const { userB, orgA } = await seedTwoTenants(database);

    await expect(
      database.asUser(userB, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return listOrganizationMembers(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects cross-tenant audit log reads', async () => {
    const { userA, userB, orgA } = await seedTwoTenants(database);

    await database.asService(async (db) => {
      await db.insert(auditEvents).values({
        organizationId: orgA.organization.id,
        actorUserId: userA,
        action: 'organization.updated',
        entityType: 'organization',
        entityId: orgA.organization.id,
        before: { name: 'Old' },
        after: { name: 'Alpha Electrical' },
      });
    });

    await expect(
      database.asUser(userB, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return listAuditEvents(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('returns only the active organization audit events without payload fields', async () => {
    const { userA, userB, orgA, orgB } = await seedTwoTenants(database);

    await database.asService(async (db) => {
      await db.insert(auditEvents).values([
        {
          organizationId: orgA.organization.id,
          actorUserId: userA,
          action: 'organization.updated',
          entityType: 'organization',
          entityId: orgA.organization.id,
          before: { secret: 'redacted' },
          after: { name: 'Alpha' },
        },
        {
          organizationId: orgB.organization.id,
          actorUserId: userB,
          action: 'organization.updated',
          entityType: 'organization',
          entityId: orgB.organization.id,
        },
      ]);
    });

    const result = await database.asUser(userA, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listAuditEvents(context);
    });

    const updatedEvents = result.items.filter((item) => item.action === 'organization.updated');
    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0]?.entityId).toBe(orgA.organization.id);
    expect(result.items.some((item) => item.entityId === orgB.organization.id)).toBe(false);
    expect(updatedEvents[0]).not.toHaveProperty('before');
    expect(updatedEvents[0]).not.toHaveProperty('after');
    expect(updatedEvents[0]).not.toHaveProperty('metadata');
  });
});
