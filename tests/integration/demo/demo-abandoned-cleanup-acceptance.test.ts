import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { demoResetItems, demoResetRuns, demoSessions, organizations } from '@drizzle/schema';
import { enterDemo, type DemoAuthPort } from '@/modules/demo/application/enter-demo';
import * as deleteSession from '@/modules/demo/application/delete-session';
import { deleteDemoSessionOrganization } from '@/modules/demo/application/delete-session';
import {
  countSessionOrganizations,
  runNightlyReset,
  type DemoResetPorts,
} from '@/modules/demo/application/nightly-reset';
import { insertDemoOrganization, withDemoProvisioner } from '@/modules/demo/application/provision';
import { buildDemoFixture } from '@/modules/demo/fixtures/fixture-builder';
import { seedDemoFixture } from '@/modules/demo/application/seed-fixture';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';

/** 03:00 Asia/Jerusalem during DST (UTC 00:00). */
const SWEEPER_DAY = new Date('2026-07-16T00:00:00.000Z');
const ROWS_FAIL_DAY = new Date('2026-07-20T00:00:00.000Z');

function recordingAuth(): DemoAuthPort {
  const byEmail = new Map<string, string>();
  return {
    async createConfirmedUser(email) {
      const userId = randomUUID();
      byEmail.set(email, userId);
      return { userId };
    },
    async signIn(email) {
      const userId = byEmail.get(email);
      if (!userId) throw new Error('missing user');
      return { userId, emailSent: false, exposedSecret: false };
    },
    async deleteUser() {},
  };
}

function emptyPorts(): DemoResetPorts {
  return {
    async deleteStoragePrefix() {},
    async deleteAuthUser() {},
    async profileEmail() {
      return null;
    },
    async membershipOrganizationIds() {
      return [];
    },
  };
}

function denyReplicationRole<T extends object>(db: T): T {
  const target = db as T & { execute: (...args: never[]) => Promise<unknown> };
  const baseExecute = target.execute.bind(target);
  return new Proxy(target, {
    get(proxyTarget, prop, receiver) {
      if (prop === 'execute') {
        return async (...args: never[]) => {
          if (/session_replication_role/i.test(String(args[0]))) {
            throw new Error('permission denied to set parameter "session_replication_role"');
          }
          return baseExecute(...args);
        };
      }
      return Reflect.get(proxyTarget, prop, receiver);
    },
  }) as T;
}

describe('demo abandoned cleanup acceptance (C1–C4)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  async function activeSessionOrg(profileKey: 'PLUMBING' | 'HVAC' = 'PLUMBING'): Promise<string> {
    const auth = recordingAuth();
    const entered = await database.asService((db) =>
      enterDemo(db, auth, { profileKey, roleKey: 'owner' }),
    );
    return entered.sessionId;
  }

  it('C1: hard-deletes the org when replication role would be denied (D1 budget purge)', async () => {
    const organizationId = await activeSessionOrg('HVAC');
    const purged = await database.asService((db) =>
      withDemoProvisioner(db, (tx) =>
        deleteDemoSessionOrganization(denyReplicationRole(tx), organizationId),
      ),
    );

    expect(purged.removedOrganization).toBe(true);
    expect(purged.softAbandoned).toBe(false);
    const gone = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${organizationId}::uuid`)),
    );
    expect(gone).toHaveLength(0);
  }, 180_000);

  it('C3: nightly rows phase fails when delete only soft-abandons', async () => {
    const organizationId = await activeSessionOrg();
    const jerusalemDate = '2026-07-20';

    await database.asService(async (db) => {
      await db.insert(demoResetRuns).values({
        jerusalemDate,
        status: 'pending',
        leaseUntil: new Date('2026-07-19T23:00:00Z'),
        lastError: null,
      });
      await db.insert(demoResetItems).values({
        jerusalemDate,
        organizationId,
        phase: 'rows',
        status: 'pending',
        storagePrefix: `${organizationId}/`,
        authUserIds: [],
        profileIds: [],
      });
    });

    const deleteSpy = vi
      .spyOn(deleteSession, 'deleteDemoSessionOrganization')
      .mockResolvedValue({ removedOrganization: false, softAbandoned: true });

    const reset = await database.asService((db) =>
      runNightlyReset(db, emptyPorts(), ROWS_FAIL_DAY),
    );
    deleteSpy.mockRestore();
    expect(reset.status).toBe('failed');

    const item = await database.asService(async (db) =>
      db
        .select()
        .from(demoResetItems)
        .where(eq(demoResetItems.organizationId, organizationId))
        .limit(1),
    );
    expect(item[0]?.status).toBe('failed');

    const remains = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${organizationId}::uuid`)),
    );
    expect(remains).toHaveLength(1);
  }, 180_000);

  it('C2: gated sweeper hard-deletes abandoned orgs', async () => {
    const fixture = buildDemoFixture('ELECTRICAL');
    const abandonedId = await database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        const templateId = await insertDemoOrganization(tx, {
          name: fixture.organizationName,
          demoKind: 'template',
          profileKey: 'ELECTRICAL',
        });
        await seedDemoFixture(tx, templateId, fixture);
        const organizationId = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} abandoned`,
          demoKind: 'session',
          profileKey: 'ELECTRICAL',
        });
        await seedDemoFixture(tx, organizationId, fixture);
        await tx.execute(sql`
          update organizations
          set demo_abandoned_at = now(), name = '[דמו-נטוש] test'
          where id = ${organizationId}::uuid
        `);
        return organizationId;
      }),
    );

    const reset = await database.asService((db) =>
      runNightlyReset(db, emptyPorts(), SWEEPER_DAY, { includeAbandonedSessionOrgs: true }),
    );
    expect(reset.status).toBe('completed');

    const gone = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${abandonedId}::uuid`)),
    );
    expect(gone).toHaveLength(0);
  }, 180_000);

  it('extra: default nightly flag does not sweep abandoned orgs', async () => {
    const abandonedId = await database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        const organizationId = await insertDemoOrganization(tx, {
          name: 'abandoned default flag',
          demoKind: 'session',
          profileKey: 'LANDSCAPING',
        });
        await tx.execute(sql`
          update organizations set demo_abandoned_at = now() where id = ${organizationId}::uuid
        `);
        return organizationId;
      }),
    );

    const reset = await database.asService((db) =>
      runNightlyReset(db, emptyPorts(), new Date('2026-07-17T00:00:00.000Z')),
    );
    expect(reset.status).toBe('completed');

    const remains = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${abandonedId}::uuid`)),
    );
    expect(remains).toHaveLength(1);
  });

  it('extra: real org with abandoned-like name is never deleted', async () => {
    const realId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`
        insert into organizations (id, name) values (${realId}::uuid, '[דמו-נטוש] מזויף')
      `);
    });

    const result = await database.asService((db) =>
      withDemoProvisioner(db, (tx) => deleteDemoSessionOrganization(tx, realId)),
    );
    expect(result.removedOrganization).toBe(false);
    expect(result.softAbandoned).toBe(false);

    const remains = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${realId}::uuid`)),
    );
    expect(remains).toHaveLength(1);
  });

  it('C4: profile switch leaves a single active demo session org', async () => {
    const auth = recordingAuth();
    const first = await database.asService((db) =>
      enterDemo(db, auth, { profileKey: 'PLUMBING', roleKey: 'owner' }),
    );
    const second = await database.asService((db) =>
      enterDemo(db, auth, {
        profileKey: 'HVAC',
        roleKey: 'owner',
        previousSessionId: first.sessionId,
      }),
    );
    expect(second.sessionId).not.toBe(first.sessionId);

    const active = await database.asService((db) => countSessionOrganizations(db));
    expect(active).toBe(1);

    const sessionRows = await database.asService(async (db) =>
      resultRows<{ id: string }>(
        await db
          .select({ id: organizations.id })
          .from(organizations)
          .innerJoin(demoSessions, eq(demoSessions.organizationId, organizations.id))
          .where(eq(organizations.demoKind, 'session')),
      ),
    );
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]!.id).toBe(second.sessionId);

    const firstGone = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${first.sessionId}::uuid`)),
    );
    expect(firstGone).toHaveLength(0);
  }, 300_000);
});