import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { invitations, organizationMemberships, roleAssignments } from '@drizzle/schema';
import {
  acceptInvitation,
  createInvitation,
  resolveOrgContext,
} from '@/modules/tenancy';
import { loadEffectivePermissions } from '@/modules/rbac';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, createTwoTenantScenario } from '../../setup/fixtures';

/**
 * MEDIUM-14: acceptInvitation must be transactional and repair a membership that
 * was created without a role assignment on a prior failed attempt.
 */
describe('acceptInvitation transactional redemption', () => {
  let database: TestDatabase;
  let scenario: Awaited<ReturnType<typeof createTwoTenantScenario>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    scenario = await createTwoTenantScenario(database);
  });

  it('assigns the invited role when a membership already exists without one', async () => {
    const email = 'orphan-member@example.test';
    const invitation = await database.asUser(scenario.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: scenario.userA.id,
        organizationId: scenario.orgA.organization.id,
        locale: 'en',
      });
      return createInvitation(context, { email, roleKey: 'finance' });
    });

    const user = await createTestUser(database, email);

    const [invitationRow] = await database.asService(async (db) =>
      db.select().from(invitations).where(eq(invitations.id, invitation.invitationId)),
    );

    await database.asService(async (db) => {
      await db.insert(organizationMemberships).values({
        organizationId: scenario.orgA.organization.id,
        userId: user.id,
        status: 'active',
      });
    });

    const beforeRoles = await database.asService((db) =>
      db
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, user.id)),
    );
    expect(beforeRoles).toHaveLength(0);

    await database.asService((db) =>
      acceptInvitation(db, {
        token: invitation.token,
        userId: user.id,
        userEmail: user.email,
      }),
    );

    const effective = await database.asService((db) =>
      loadEffectivePermissions(db, scenario.orgA.organization.id, user.id),
    );
    expect(effective.roleKeys).toContain('finance');
    expect(effective.permissions.has(PERMISSIONS.BILLING_MANAGE)).toBe(true);

    const [accepted] = await database.asService(async (db) =>
      db.select({ status: invitations.status }).from(invitations).where(eq(invitations.id, invitationRow!.id)),
    );
    expect(accepted?.status).toBe('accepted');
  });
});
