import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { invitations } from '@drizzle/schema';
import {
  acceptInvitation,
  createInvitation,
  getInvitationPreview,
  listOrganizationMembers,
  resolveOrgContext,
  revokeInvitation,
} from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, createTwoTenantScenario } from '../../setup/fixtures';

/**
 * The invitation token is the only thing standing between a stranger and a
 * tenant's data, so every way it can be misused gets a test.
 */
describe('invitations', () => {
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

  async function ownerContext() {
    return { userId: scenario.userA.id, organizationId: scenario.orgA.organization.id };
  }

  async function invite(email: string, roleKey = 'worker') {
    const { userId, organizationId } = await ownerContext();
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'en' });
      return createInvitation(context, { email, roleKey });
    });
  }

  it('lets an invited person join, and only through their own address', async () => {
    const invitation = await invite('newcomer@example.test');
    const newcomer = await createTestUser(database, 'newcomer@example.test');

    const preview = await database.asService((db) => getInvitationPreview(db, invitation.token));
    expect(preview?.organizationName).toBe('Alpha Electrical');
    expect(preview?.email).toBe('newcomer@example.test');

    const result = await database.asService((db) =>
      acceptInvitation(db, {
        token: invitation.token,
        userId: newcomer.id,
        userEmail: newcomer.email,
      }),
    );
    expect(result.organizationId).toBe(scenario.orgA.organization.id);

    // Listed by the owner: a worker deliberately cannot read the member list.
    const { userId, organizationId } = await ownerContext();
    const members = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'en' });
      return listOrganizationMembers(context);
    });

    expect(members.map((member) => member.email)).toContain('newcomer@example.test');
    // The invited role is what they get — not the inviter's role.
    expect(members.find((member) => member.email === 'newcomer@example.test')?.roleKeys).toEqual([
      'worker',
    ]);
  });

  it('refuses a token presented by a different email address', async () => {
    const invitation = await invite('intended@example.test');
    const impostor = await createTestUser(database, 'impostor@example.test');

    await expect(
      database.asService((db) =>
        acceptInvitation(db, {
          token: invitation.token,
          userId: impostor.id,
          userEmail: impostor.email,
        }),
      ),
    ).rejects.toThrow(/different email/i);
  });

  it('cannot be redeemed twice', async () => {
    const invitation = await invite('once@example.test');
    const user = await createTestUser(database, 'once@example.test');

    await database.asService((db) =>
      acceptInvitation(db, { token: invitation.token, userId: user.id, userEmail: user.email }),
    );

    await expect(
      database.asService((db) =>
        acceptInvitation(db, { token: invitation.token, userId: user.id, userEmail: user.email }),
      ),
    ).rejects.toThrow();

    expect(await database.asService((db) => getInvitationPreview(db, invitation.token))).toBeNull();
  });

  it('stops working once it expires', async () => {
    const invitation = await invite('late@example.test');
    const user = await createTestUser(database, 'late@example.test');

    await database.asService(async (db) => {
      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invitations.id, invitation.invitationId));
    });

    expect(await database.asService((db) => getInvitationPreview(db, invitation.token))).toBeNull();
    await expect(
      database.asService((db) =>
        acceptInvitation(db, { token: invitation.token, userId: user.id, userEmail: user.email }),
      ),
    ).rejects.toThrow(/expired/i);
  });

  it('stops working once it is revoked', async () => {
    const invitation = await invite('revoked@example.test');
    const user = await createTestUser(database, 'revoked@example.test');
    const { userId, organizationId } = await ownerContext();

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'en' });
      await revokeInvitation(context, invitation.invitationId);
    });

    expect(await database.asService((db) => getInvitationPreview(db, invitation.token))).toBeNull();
    await expect(
      database.asService((db) =>
        acceptInvitation(db, { token: invitation.token, userId: user.id, userEmail: user.email }),
      ),
    ).rejects.toThrow();
  });

  it('reveals nothing for a token that was never issued', async () => {
    expect(await database.asService((db) => getInvitationPreview(db, 'not-a-real-token'))).toBeNull();
    expect(await database.asService((db) => getInvitationPreview(db, ''))).toBeNull();
  });

  it('never stores the plaintext token', async () => {
    const invitation = await invite('hashed@example.test');

    const [row] = await database.asService(async (db) =>
      db
        .select({ tokenHash: invitations.tokenHash })
        .from(invitations)
        .where(eq(invitations.id, invitation.invitationId)),
    );

    expect(row!.tokenHash).not.toBe(invitation.token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not let an owner of one tenant invite into another', async () => {
    await expect(
      database.asUser(scenario.userA.id, async (tx) =>
        resolveOrgContext(tx, {
          userId: scenario.userA.id,
          organizationId: scenario.orgB.organization.id,
          locale: 'en',
        }),
      ),
    ).rejects.toThrow();
  });
});
