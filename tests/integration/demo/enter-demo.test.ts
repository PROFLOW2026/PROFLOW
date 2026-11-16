import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { enterDemo, type DemoAuthPort } from "@/modules/demo/application/enter-demo";
import { DEMO_FIXTURE_KEYS } from "@/modules/demo/fixtures/fixture-builder";
import { switchDemoRole } from "@/modules/demo/application/switch-role";
import { createTestDatabase, resultRows, type TestDatabase } from "@tests/setup/database";
import { seedSystem } from "@tests/setup/fixtures";

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
      if (!userId) throw new Error("missing user");
      return { userId, emailSent: false, exposedSecret: false };
    },
    async deleteUser() {},
  };
}

describe("demo entry creates three surfaces", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  it("opens an owner session with an employee account and a contractor grant", async () => {
    const auth = fakeAuth();
    const result = await database.asService((db) =>
      enterDemo(db, auth, { profileKey: "ELECTRICAL", roleKey: "owner" }),
    );
    expect(result.roleKey).toBe("owner");
    const counts = await database.asService(async (db) =>
      resultRows<{ employees: number; grants: number; actors: number }>(
        await db.execute(sql`
          select
            (select count(*)::int from employee_app_accounts where organization_id = ${result.sessionId}::uuid) as employees,
            (select count(*)::int from external_access_grants where organization_id = ${result.sessionId}::uuid) as grants,
            (select count(*)::int from demo_session_actors where organization_id = ${result.sessionId}::uuid) as actors
        `),
      )[0]!,
    );
    expect(counts.employees).toBe(4);
    expect(counts.grants).toBe(1);
    expect(counts.actors).toBe(6);
    const switched = await database.asService((db) =>
      switchDemoRole(db, auth, { sessionId: result.sessionId, body: { roleKey: "employee" } }),
    );
    expect(switched.roleKey).toBe("employee");
    await expect(
      database.asService((db) =>
        switchDemoRole(db, auth, { sessionId: result.sessionId, body: { roleKey: "employee", userId: switched.userId } }),
      ),
    ).rejects.toThrow();
  }, 120_000);

  it("enters every onboarding profile", async () => {
    for (const profileKey of DEMO_FIXTURE_KEYS) {
      const result = await database.asService((db) =>
        enterDemo(db, fakeAuth(), { profileKey, roleKey: "manager" }),
      );
      expect(result.profileKey).toBe(profileKey);
    }
  }, 180_000);
});
