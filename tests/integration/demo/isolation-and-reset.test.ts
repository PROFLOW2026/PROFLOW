import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { projects } from "@drizzle/schema";
import { enterDemo, type DemoAuthPort } from "@/modules/demo/application/enter-demo";
import { runNightlyReset, type DemoResetPorts } from "@/modules/demo/application/nightly-reset";
import { buildDemoFixture } from "@/modules/demo/fixtures/fixture-builder";
import { startAnalysisUseCase } from "@/modules/electrical-takeoff/application/use-cases";
import { listActiveOrganizationIds } from "@/modules/tenancy";
import type { OrgContext } from "@/shared/auth/context";
import { createTestDatabase, resultRows, type TestDatabase } from "@tests/setup/database";
import { seedSystem } from "@tests/setup/fixtures";

const SUMMER = new Date("2026-07-15T00:00:00.000Z");

function recordingAuth(): DemoAuthPort & { emailFor(userId: string): string | null } {
  const byEmail = new Map<string, string>();
  const byId = new Map<string, string>();
  return {
    async createConfirmedUser(email) {
      const userId = randomUUID();
      byEmail.set(email, userId);
      byId.set(userId, email);
      return { userId };
    },
    async signIn(email) {
      const userId = byEmail.get(email);
      if (!userId) throw new Error("missing user");
      return { userId, emailSent: false, exposedSecret: false };
    },
    async deleteUser(userId) {
      const email = byId.get(userId);
      if (email) byEmail.delete(email);
      byId.delete(userId);
    },
    emailFor(userId) {
      return byId.get(userId) ?? null;
    },
  };
}

describe("demo visitors stay isolated and reset restores the fixture", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  it("lets one visitor edit only their own session", async () => {
    const firstAuth = recordingAuth();
    const secondAuth = recordingAuth();
    const first = await database.asService((db) =>
      enterDemo(db, firstAuth, { profileKey: "PLUMBING", roleKey: "owner" }),
    );
    const second = await database.asService((db) =>
      enterDemo(db, secondAuth, { profileKey: "PLUMBING", roleKey: "owner" }),
    );
    expect(first.sessionId).not.toBe(second.sessionId);

    const renamed = await database.asUser(first.signedInUserId, async (tx) => {
      const updated = await tx
        .update(projects)
        .set({ name: "שינוי של מבקר א" })
        .where(eq(projects.organizationId, first.sessionId))
        .returning({ id: projects.id });
      return updated.length;
    });
    expect(renamed).toBeGreaterThan(0);

    const seenBySecond = await database.asUser(second.signedInUserId, async (tx) =>
      resultRows(await tx.execute(sql`select id from projects where organization_id = ${first.sessionId}::uuid`)),
    );
    expect(seenBySecond).toHaveLength(0);

    const realId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`insert into organizations (id, name) values (${realId}::uuid, 'ארגון אמיתי')`);
    });
    const realSeen = await database.asUser(first.signedInUserId, async (tx) =>
      resultRows(await tx.execute(sql`select id from organizations where id = ${realId}::uuid`)),
    );
    expect(realSeen).toHaveLength(0);
    await database.asUser(first.signedInUserId, (tx) =>
      tx.execute(sql`delete from organizations where id = ${realId}::uuid`),
    );
    const realRemains = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${realId}::uuid`)),
    );
    expect(realRemains).toHaveLength(1);

    const active = await database.asService((db) => listActiveOrganizationIds(db));
    expect(active.map((row) => row.id)).toEqual([realId]);
    await expect(
      startAnalysisUseCase(
        { db: database.db, organizationId: first.sessionId } as OrgContext,
        "00000000-0000-4000-8000-000000000000",
        { fileIds: [] },
      ),
    ).rejects.toThrow(/Demo organizations/);
  });

  it("deletes visitor changes and opens the next session from the fixture", async () => {
    const auth = recordingAuth();
    const entered = await database.asService((db) =>
      enterDemo(db, auth, { profileKey: "HVAC", roleKey: "manager" }),
    );
    await database.asUser(entered.signedInUserId, (tx) =>
      tx.update(projects).set({ name: "שינוי זמני" }).where(eq(projects.organizationId, entered.sessionId)),
    );
    const templateName = buildDemoFixture("HVAC").projects.find((project) => project.key === "p-active")?.name;
    const ports: DemoResetPorts = {
      async deleteStoragePrefix() {},
      async deleteAuthUser(userId) {
        await auth.deleteUser(userId);
      },
      async profileEmail(profileId) {
        return auth.emailFor(profileId);
      },
      async membershipOrganizationIds() {
        return [];
      },
    };
    const reset = await database.asService((db) => runNightlyReset(db, ports, SUMMER));
    expect(reset.status).toBe("completed");
    const gone = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${entered.sessionId}::uuid`)),
    );
    expect(gone).toHaveLength(0);

    const again = await database.asService((db) =>
      enterDemo(db, recordingAuth(), { profileKey: "HVAC", roleKey: "owner" }),
    );
    const names = await database.asService(async (db) =>
      resultRows<{ name: string }>(
        await db.execute(sql`select name from projects where organization_id = ${again.sessionId}::uuid`),
      ),
    );
    expect(names.map((row) => row.name)).toContain(templateName);
    expect(names.map((row) => row.name)).not.toContain("שינוי זמני");
  });

  it("resets every active visitor and restores each visitor's documents", async () => {
    const firstAuth = recordingAuth();
    const secondAuth = recordingAuth();
    const first = await database.asService((db) =>
      enterDemo(db, firstAuth, { profileKey: "ELECTRICAL", roleKey: "owner" }),
    );
    const second = await database.asService((db) =>
      enterDemo(db, secondAuth, { profileKey: "PLUMBING", roleKey: "owner" }),
    );
    const renamedFirst = await database.asUser(first.signedInUserId, async (tx) => {
      const updated = await tx
        .update(projects)
        .set({ name: "עריכת מבקר א" })
        .where(eq(projects.organizationId, first.sessionId))
        .returning({ id: projects.id });
      return updated.length;
    });
    const renamedSecond = await database.asUser(second.signedInUserId, async (tx) => {
      const updated = await tx
        .update(projects)
        .set({ name: "עריכת מבקר ב" })
        .where(eq(projects.organizationId, second.sessionId))
        .returning({ id: projects.id });
      return updated.length;
    });
    expect(renamedFirst).toBeGreaterThan(0);
    expect(renamedSecond).toBeGreaterThan(0);

    const ownDocs = await database.asUser(first.signedInUserId, async (tx) =>
      resultRows<{ original_filename: string }>(
        await tx.execute(
          sql`select original_filename from documents where organization_id = ${first.sessionId}::uuid`,
        ),
      ),
    );
    expect(ownDocs.map((row) => row.original_filename).sort()).toEqual([
      "מפרט לדוגמה.pdf",
      "תוכנית לדוגמה.pdf",
    ]);
    const leaked = await database.asUser(second.signedInUserId, async (tx) =>
      resultRows(
        await tx.execute(sql`select id from documents where organization_id = ${first.sessionId}::uuid`),
      ),
    );
    expect(leaked).toHaveLength(0);

    const realId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`insert into organizations (id, name) values (${realId}::uuid, 'ארגון אמיתי נוסף')`);
    });
    const reset = await database.asService((db) =>
      runNightlyReset(
        db,
        {
          async deleteStoragePrefix() {},
          async deleteAuthUser(userId) {
            await firstAuth.deleteUser(userId);
            await secondAuth.deleteUser(userId);
          },
          async profileEmail(profileId) {
            return firstAuth.emailFor(profileId) ?? secondAuth.emailFor(profileId);
          },
          async membershipOrganizationIds() {
            return [];
          },
        },
        new Date("2026-07-16T00:00:00.000Z"),
      ),
    );
    expect(reset.status).toBe("completed");
    const gone = await database.asService(async (db) =>
      resultRows(
        await db.execute(
          sql`select id from organizations where id in (${first.sessionId}::uuid, ${second.sessionId}::uuid)`,
        ),
      ),
    );
    expect(gone).toHaveLength(0);
    const realRemains = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${realId}::uuid`)),
    );
    expect(realRemains).toHaveLength(1);

    const restored = await database.asService((db) =>
      enterDemo(db, recordingAuth(), { profileKey: "ELECTRICAL", roleKey: "owner" }),
    );
    const names = await database.asService(async (db) =>
      resultRows<{ name: string }>(
        await db.execute(sql`select name from projects where organization_id = ${restored.sessionId}::uuid`),
      ),
    );
    expect(names.map((row) => row.name)).toContain("פרויקט פעיל — חשמל");
    expect(names.map((row) => row.name)).not.toContain("עריכת מבקר א");
    const docs = await database.asService(async (db) =>
      resultRows<{ original_filename: string }>(
        await db.execute(
          sql`select original_filename from documents where organization_id = ${restored.sessionId}::uuid`,
        ),
      ),
    );
    expect(docs.map((row) => row.original_filename).sort()).toEqual([
      "מפרט לדוגמה.pdf",
      "תוכנית לדוגמה.pdf",
    ]);
  });
});
