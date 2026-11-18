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

function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] } | null)?.queryChunks;
  if (!Array.isArray(chunks)) return String(query);
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown } | null)?.value;
      return Array.isArray(value) ? value.join('') : '';
    })
    .join('');
}

/**
 * Simulates hosted Supabase refusing `session_replication_role`: the refusal is raised by
 * Postgres itself, so it aborts the (sub)transaction exactly like Production does.
 */
function denyReplicationRole<T extends object>(db: T): T {
  const target = db as T & { execute: (...args: never[]) => Promise<unknown> };
  const baseExecute = target.execute.bind(target);
  return new Proxy(target, {
    get(proxyTarget, prop, receiver) {
      if (prop === 'execute') {
        return async (...args: never[]) => {
          if (/session_replication_role/i.test(sqlText(args[0]))) {
            await baseExecute(
              sql`do $$ begin raise exception 'permission denied to set parameter "session_replication_role"'; end $$` as never,
            );
          }
          return baseExecute(...args);
        };
      }
      if (prop === 'transaction') {
        const baseTransaction = Reflect.get(proxyTarget, prop, receiver) as (
          callback: (tx: object) => Promise<unknown>,
        ) => Promise<unknown>;
        return (callback: (tx: object) => Promise<unknown>) =>
          baseTransaction.call(proxyTarget, (inner: object) => callback(denyReplicationRole(inner)));
      }
      return Reflect.get(proxyTarget, prop, receiver);
    },
  }) as T;
}

const ROLLBACK = new Error('test rollback');

/** Runs `fn` in a transaction that is always rolled back; returns what `fn` produced. */
async function inRolledBackTransaction<T>(
  database: TestDatabase,
  fn: (tx: Parameters<Parameters<TestDatabase['asService']>[0]>[0]) => Promise<T>,
): Promise<T> {
  let produced: { value: T } | null = null;
  await expect(
    database.asService((db) =>
      db.transaction(async (tx) => {
        produced = { value: await fn(tx as never) };
        throw ROLLBACK;
      }),
    ),
  ).rejects.toBe(ROLLBACK);
  if (!produced) throw new Error('transaction body did not finish');
  return (produced as { value: T }).value;
}

const PURGE_DENIED = sql`
  create or replace function app.demo_session_budget_purge_allowed(p_org_id uuid)
  returns boolean language sql stable as $$ select false $$
`;

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

  it('C5: a rejected budget purge falls back without aborting the transaction', async () => {
    const organizationId = await activeSessionOrg('HVAC');
    const outcome = await inRolledBackTransaction(database, async (tx) => {
      const lines = resultRows<{ n: number }>(
        await tx.execute(sql`
          select count(*)::int as n from project_budget_lines
          where organization_id = ${organizationId}::uuid
        `),
      );
      expect(Number(lines[0]?.n ?? 0)).toBeGreaterThan(0);
      await tx.execute(PURGE_DENIED);
      const result = await withDemoProvisioner(tx, (inner) =>
        deleteDemoSessionOrganization(inner, organizationId),
      );
      const remaining = resultRows(
        await tx.execute(sql`select id from organizations where id = ${organizationId}::uuid`),
      );
      return { result, remaining: remaining.length };
    });
    expect(outcome).toEqual({
      result: { removedOrganization: true, softAbandoned: false },
      remaining: 0,
    });
  }, 180_000);

  it('C5b: purge and replication both refused soft-abandons with the durable marker', async () => {
    const organizationId = await activeSessionOrg('HVAC');
    const outcome = await inRolledBackTransaction(database, async (tx) => {
      await tx.execute(PURGE_DENIED);
      const result = await withDemoProvisioner(denyReplicationRole(tx), (inner) =>
        deleteDemoSessionOrganization(inner, organizationId),
      );
      const org = resultRows<{ demo_abandoned_at: unknown; has_session: boolean }>(
        await tx.execute(sql`
          select o.demo_abandoned_at,
            exists (select 1 from demo_sessions s where s.organization_id = o.id) as has_session
          from organizations o where o.id = ${organizationId}::uuid
        `),
      );
      return { result, org: org[0] };
    });
    expect(outcome.result).toEqual({ removedOrganization: false, softAbandoned: true });
    expect(outcome.org?.demo_abandoned_at).not.toBeNull();
    expect(outcome.org?.has_session).toBe(false);
  }, 180_000);

  it('C6: a demo template org with full data is never touched by session delete', async () => {
    const fixture = buildDemoFixture('PLUMBING');
    const templateId = await database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        const id = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} template guard`,
          demoKind: 'template',
          profileKey: 'PLUMBING',
        });
        await seedDemoFixture(tx, id, fixture);
        return id;
      }),
    );
    const snapshot = async () =>
      database.asService(async (db) =>
        resultRows<{ bills: number; payments: number; entries: number; budgets: number }>(
          await db.execute(sql`
            select
              (select count(*)::int from ap_bills where organization_id = ${templateId}::uuid and status <> 'void') as bills,
              (select count(*)::int from ap_payments where organization_id = ${templateId}::uuid and status <> 'void') as payments,
              (select count(*)::int from time_entries where organization_id = ${templateId}::uuid and status <> 'void') as entries,
              (select count(*)::int from project_budgets where organization_id = ${templateId}::uuid) as budgets
          `),
        )[0],
      );
    const before = await snapshot();
    const result = await database.asService((db) =>
      withDemoProvisioner(db, (tx) => deleteDemoSessionOrganization(tx, templateId)),
    );
    expect(result).toEqual({ removedOrganization: false, softAbandoned: false });
    expect(await snapshot()).toEqual(before);
  }, 180_000);

  it('C7: a queued org that no longer exists completes the nightly item', async () => {
    const jerusalemDate = '2026-07-22';
    const ghostId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(demoResetRuns).values({
        jerusalemDate,
        status: 'failed',
        leaseUntil: new Date('2026-07-21T23:00:00Z'),
        lastError: 'one or more items failed',
      });
      for (const phase of ['rows', 'storage', 'auth'] as const) {
        await db.insert(demoResetItems).values({
          jerusalemDate,
          organizationId: ghostId,
          phase,
          status: 'failed',
          storagePrefix: `${ghostId}/`,
          authUserIds: [randomUUID()],
          profileIds: [],
        });
      }
    });
    const reset = await database.asService((db) =>
      runNightlyReset(db, emptyPorts(), new Date('2026-07-22T08:00:00.000Z')),
    );
    expect(reset.status).toBe('completed');
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