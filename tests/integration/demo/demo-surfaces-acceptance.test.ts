/**
 * Demo acceptance A17–A19 — surfaces, notifications, session lifecycle.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, projects, coordinationEvents } from '@drizzle/schema';
import { enterDemo, type DemoAuthPort } from '@/modules/demo/application/enter-demo';
import { switchDemoRole } from '@/modules/demo/application/switch-role';
import { deleteDemoSessionOrganization } from '@/modules/demo/application/delete-session';
import { withDemoProvisioner } from '@/modules/demo/application/provision';
import { isDemoMintedEmail, mayDeleteDemoIdentity } from '@/modules/demo/domain/identity-rule';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';

function fakeAuth(): DemoAuthPort {
  const users = new Map<string, string>();
  return {
    async createConfirmedUser(email) {
      const userId = randomUUID();
      users.set(email, userId);
      return { userId };
    },
    async signIn(email) {
      const userId = users.get(email);
      if (!userId) throw new Error('missing user');
      return { userId, emailSent: false, exposedSecret: false };
    },
    async deleteUser() {},
  };
}

describe('demo surfaces acceptance A17–A19', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 240_000);

  afterAll(async () => {
    await database.close();
  });

  it('A17–A19 enter, notifications, coordination, role switch, profile switch, delete', async () => {
    const auth = fakeAuth();
    const first = await database.asService((db) =>
      enterDemo(db, auth, { profileKey: 'GENERAL_CONTRACTOR', roleKey: 'owner' }),
    );
    expect(first.sessionId).toBeTruthy();

    const noteRows = await database.asService(async (db) =>
      db
        .select({ id: notifications.id, recipientUserId: notifications.recipientUserId })
        .from(notifications)
        .where(eq(notifications.organizationId, first.sessionId)),
    );
    const recipients = new Set(noteRows.map((r) => r.recipientUserId));
    // A18: 6 roles × 4 notification templates
    expect(noteRows.length).toBeGreaterThanOrEqual(24);
    expect(recipients.size).toBeGreaterThanOrEqual(6);

    const coord = await database.asService(async (db) => {
      const rows = await db
        .select({ id: coordinationEvents.id })
        .from(coordinationEvents)
        .where(eq(coordinationEvents.organizationId, first.sessionId));
      const projectRows = await db
        .select({ id: projects.id, name: projects.name, status: projects.status })
        .from(projects)
        .where(eq(projects.organizationId, first.sessionId));
      return { rows, projectRows };
    });
    // A17
    expect(coord.rows.length).toBeGreaterThanOrEqual(2);
    expect(coord.projectRows.some((p) => p.status === 'active')).toBe(true);

    // A19 role switch same org
    const switched = await database.asService((db) =>
      switchDemoRole(db, auth, { sessionId: first.sessionId, body: { roleKey: 'finance' } }),
    );
    expect(switched.roleKey).toBe('finance');

    // A19 profile switch deletes previous and creates new
    const second = await database.asService((db) =>
      enterDemo(db, auth, {
        profileKey: 'ELECTRICAL',
        roleKey: 'owner',
        previousSessionId: first.sessionId,
      }),
    );
    expect(second.sessionId).not.toBe(first.sessionId);

    const oldGone = await database.asService(async (db) => {
      const rows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.organizationId, first.sessionId));
      return rows.length;
    });
    expect(oldGone).toBe(0);

    expect(isDemoMintedEmail(`x@demo.pf.internal`)).toBe(true);
    expect(
      mayDeleteDemoIdentity({
        email: `demo.owner@demo.pf.internal`,
        membershipOrganizationIds: [second.sessionId],
        deletingOrganizationIds: new Set([second.sessionId]),
      }),
    ).toBe(true);

    await database.asService((db) =>
      withDemoProvisioner(db, (tx) => deleteDemoSessionOrganization(tx, second.sessionId)),
    );
  }, 300_000);
});
