import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { demoSessionActors, demoSessions, projects } from "@drizzle/schema";
import { insertDemoOrganization, withDemoProvisioner } from "@/modules/demo/application/provision";
import { runNightlyReset, type DemoResetPorts } from "@/modules/demo/application/nightly-reset";
import { buildDemoFixture } from "@/modules/demo/fixtures/fixture-builder";
import { seedDemoFixture } from "@/modules/demo/application/seed-fixture";
import { createTestDatabase, resultRows, type TestDatabase } from "@tests/setup/database";
import { seedSystem } from "@tests/setup/fixtures";

const SUMMER = new Date("2026-07-15T00:00:00Z");

describe("demo seed and nightly reset", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  async function sessionOrg(): Promise<string> {
    const fixture = buildDemoFixture("GENERAL_CONTRACTOR");
    return database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        const templateId = await insertDemoOrganization(tx, {
          name: fixture.organizationName,
          demoKind: "template",
          profileKey: "GENERAL_CONTRACTOR",
        });
        await seedDemoFixture(tx, templateId, fixture);
        const before = resultRows<{ count: number }>(
          await tx.execute(sql`select count(*)::int as count from projects where organization_id = ${templateId}::uuid`),
        )[0]!.count;
        const organizationId = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} session`,
          demoKind: "session",
          profileKey: "GENERAL_CONTRACTOR",
        });
        await seedDemoFixture(tx, organizationId, fixture);
        const after = resultRows<{ count: number }>(
          await tx.execute(sql`select count(*)::int as count from projects where organization_id = ${templateId}::uuid`),
        )[0]!.count;
        if (before !== after) throw new Error("template project count changed");
        const userId = randomUUID();
        await tx.insert(demoSessions).values({
          organizationId,
          templateOrganizationId: templateId,
          profileKey: "GENERAL_CONTRACTOR",
          browserTokenHash: "hash",
        });
        await tx.insert(demoSessionActors).values({
          organizationId,
          roleKey: "owner",
          authUserId: userId,
          email: `${organizationId}.owner@demo.pf.internal`,
        });
        return organizationId;
      }),
    );
  }

  it("seeds linked demo rows without changing the template", async () => {
    const organizationId = await sessionOrg();
    const counts = await database.asService(async (db) => {
      const [projectRows] = await db.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, organizationId));
      const tables = resultRows<{
        projects: number;
        clients: number;
        employees: number;
        ap_open: number;
        ap_lines: number;
        ap_payments: number;
        ap_applications: number;
      }>(
        await db.execute(sql`
          select
            (select count(*)::int from projects where organization_id = ${organizationId}::uuid) as projects,
            (select count(*)::int from clients where organization_id = ${organizationId}::uuid) as clients,
            (select count(*)::int from employees where organization_id = ${organizationId}::uuid) as employees,
            (select count(*)::int from ap_bills where organization_id = ${organizationId}::uuid and status = 'open') as ap_open,
            (select count(*)::int from ap_bill_lines where organization_id = ${organizationId}::uuid) as ap_lines,
            (select count(*)::int from ap_payments where organization_id = ${organizationId}::uuid and status = 'recorded') as ap_payments,
            (select count(*)::int from ap_payment_applications where organization_id = ${organizationId}::uuid) as ap_applications
        `),
      )[0]!;
      return { projectRows, tables };
    });
    expect(counts.tables.projects).toBeGreaterThanOrEqual(8);
    expect(counts.tables.clients).toBeGreaterThanOrEqual(5);
    expect(counts.tables.employees).toBeGreaterThanOrEqual(6);
    expect(counts.tables.ap_open).toBeGreaterThanOrEqual(5);
    expect(counts.tables.ap_lines).toBe(counts.tables.ap_open);
    expect(counts.tables.ap_payments).toBeGreaterThanOrEqual(2);
    expect(counts.tables.ap_applications).toBe(counts.tables.ap_payments);
    expect(counts.projectRows?.id).toBeTruthy();
  });

  it("keeps the organization when the row phase fails and deletes it on resume", async () => {
    const organizationId = await sessionOrg();
    const ports: DemoResetPorts = {
      async deleteStoragePrefix() {},
      async deleteAuthUser() {},
      async profileEmail() {
        return `${organizationId}.owner@demo.pf.internal`;
      },
      async membershipOrganizationIds() {
        return [organizationId];
      },
    };
    const failed = await database.asService((db) =>
      runNightlyReset(db, ports, SUMMER, { failPhase: "rows" }),
    );
    expect(failed.status).toBe("failed");
    const stillThere = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${organizationId}::uuid`)),
    );
    expect(stillThere).toHaveLength(1);
    const resumed = await database.asService((db) => runNightlyReset(db, ports, SUMMER));
    expect(resumed.status).toBe("completed");
    const gone = await database.asService(async (db) =>
      resultRows(await db.execute(sql`select id from organizations where id = ${organizationId}::uuid`)),
    );
    expect(gone).toHaveLength(0);
  });
});
