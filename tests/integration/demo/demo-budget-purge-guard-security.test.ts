/**
 * Security S1–S9 for app.demo_session_budget_purge_allowed (migration 0215).
 * The demo budget bypass must rest on the effective role, never on the
 * forgeable `app.demo_provisioner` session setting.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { enterDemo, type DemoAuthPort } from '@/modules/demo/application/enter-demo';
import { insertDemoOrganization, withDemoProvisioner } from '@/modules/demo/application/provision';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';

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

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

async function purgeAllowed(tx: Executor, organizationId: string): Promise<boolean> {
  const rows = resultRows<{ allowed: boolean }>(
    await tx.execute(sql`select app.demo_session_budget_purge_allowed(${organizationId}::uuid) as allowed`),
  );
  return rows[0]!.allowed;
}

describe('demo budget purge guard security (S1–S9)', () => {
  let database: TestDatabase;
  let sessionOrgId: string;
  let ownerUserId: string;
  let realOrgId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    const entered = await database.asService((db) =>
      enterDemo(db, recordingAuth(), { profileKey: 'ELECTRICAL', roleKey: 'owner' }),
    );
    sessionOrgId = entered.sessionId;
    ownerUserId = entered.signedInUserId;
    realOrgId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`insert into organizations (id, name) values (${realOrgId}::uuid, 'עסק אמיתי')`);
    });
  }, 300_000);

  afterAll(async () => {
    await database.close();
  });

  it('S1: authenticated with forged app.demo_provisioner=on is refused', async () => {
    const allowed = await database.asUser(ownerUserId, async (tx) => {
      await tx.execute(sql`select set_config('app.demo_provisioner', 'on', true)`);
      return purgeAllowed(tx, sessionOrgId);
    });
    expect(allowed).toBe(false);
  });

  it('S2: authenticated cannot purge history-bearing demo budgets via set_config', async () => {
    const countBudgets = async () =>
      database.asService(async (db) =>
        resultRows<{ n: number }>(
          await db.execute(sql`
            select count(*)::int as n from project_budgets where organization_id = ${sessionOrgId}::uuid
          `),
        )[0]!.n,
      );
    const before = await countBudgets();
    expect(before).toBeGreaterThan(0);

    let rejected = false;
    try {
      await database.asUser(ownerUserId, async (tx) => {
        await tx.execute(sql`select set_config('app.demo_provisioner', 'on', true)`);
        await tx.execute(sql`delete from project_budgets where organization_id = ${sessionOrgId}::uuid`);
      });
    } catch (error) {
      rejected = true;
      expect(String((error as Error)?.cause ?? error)).toMatch(/project_budgets|permission denied/i);
    }

    expect(await countBudgets()).toBe(before);
    expect(rejected).toBe(true);
  });

  it('S3: trusted service is refused for a real organization', async () => {
    const allowed = await database.asService((db) =>
      withDemoProvisioner(db, (tx) => purgeAllowed(tx, realOrgId)),
    );
    expect(allowed).toBe(false);
  });

  it('S4: trusted service is refused for a demo template', async () => {
    const templateId = await database.asService((db) =>
      withDemoProvisioner(db, (tx) =>
        insertDemoOrganization(tx, { name: 'template probe', demoKind: 'template', profileKey: 'HVAC' }),
      ),
    );
    const allowed = await database.asService((db) =>
      withDemoProvisioner(db, (tx) => purgeAllowed(tx, templateId)),
    );
    expect(allowed).toBe(false);
  });

  it('S5: trusted service without the provisioner flag is refused', async () => {
    const allowed = await database.asService((db) => purgeAllowed(db, sessionOrgId));
    expect(allowed).toBe(false);
  });

  it('S6: session org without demo_sessions row and without abandon marker is refused', async () => {
    const orphanId = await database.asService((db) =>
      withDemoProvisioner(db, (tx) =>
        insertDemoOrganization(tx, { name: 'orphan session probe', demoKind: 'session', profileKey: 'HVAC' }),
      ),
    );
    const allowed = await database.asService((db) =>
      withDemoProvisioner(db, (tx) => purgeAllowed(tx, orphanId)),
    );
    expect(allowed).toBe(false);
  });

  it('S7: trusted service is allowed for a live demo session org', async () => {
    const allowed = await database.asService((db) =>
      withDemoProvisioner(db, (tx) => purgeAllowed(tx, sessionOrgId)),
    );
    expect(allowed).toBe(true);
  });

  it('S8: authenticated can evaluate the guard on a real org without permission errors', async () => {
    const allowed = await database.asUser(ownerUserId, async (tx) => {
      await tx.execute(sql`select set_config('app.demo_provisioner', 'on', true)`);
      return purgeAllowed(tx, realOrgId);
    });
    expect(allowed).toBe(false);
  });

  it('S9: service_role (BYPASSRLS) is an authorized service for a live session org', async () => {
    const allowed = await database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        await tx.execute(sql`set local role service_role`);
        return purgeAllowed(tx, sessionOrgId);
      }),
    );
    expect(allowed).toBe(true);
  });
});
