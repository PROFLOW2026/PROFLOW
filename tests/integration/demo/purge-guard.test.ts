import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, resultRows, type TestDatabase } from "@tests/setup/database";

describe("demo takeoff purge guard", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database.close();
  });

  async function seedChain(label: string, demoKind: string | null, withSession: boolean) {
    return database.asService(async (db) =>
      db.transaction(async (tx) => {
        const org = resultRows<{ id: string }>(
          await tx.execute(sql`INSERT INTO organizations (name) VALUES (${label}) RETURNING id`),
        )[0]!;
        if (demoKind) {
          await tx.execute(sql`SELECT set_config('app.demo_provisioner', 'on', true)`);
          await tx.execute(sql`UPDATE organizations SET demo_kind = ${demoKind} WHERE id = ${org.id}::uuid`);
        }
        const project = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO projects (organization_id, name, status, currency)
            VALUES (${org.id}::uuid, ${label}, 'active', 'ILS')
            RETURNING id
          `),
        )[0]!;
        const analysis = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO takeoff_analyses (organization_id, project_id, name)
            VALUES (${org.id}::uuid, ${project.id}::uuid, ${label})
            RETURNING id
          `),
        )[0]!;
        const job = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO takeoff_jobs (organization_id, project_id, analysis_id)
            VALUES (${org.id}::uuid, ${project.id}::uuid, ${analysis.id}::uuid)
            RETURNING id
          `),
        )[0]!;
        const detection = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO takeoff_detections (
              organization_id, project_id, job_id, analysis_id, detection_key, sheet_key, payload
            ) VALUES (
              ${org.id}::uuid, ${project.id}::uuid, ${job.id}::uuid, ${analysis.id}::uuid,
              'd1', 's1', '{}'::jsonb
            )
            RETURNING id
          `),
        )[0]!;
        if (withSession) {
          await tx.execute(sql`SELECT set_config('app.demo_provisioner', 'on', true)`);
          await tx.execute(sql`
            INSERT INTO demo_sessions (organization_id, template_organization_id, profile_key, browser_token_hash)
            VALUES (${org.id}::uuid, ${org.id}::uuid, 'GENERAL_CONTRACTOR', 'hash')
          `);
        }
        return { orgId: org.id, detectionId: detection.id };
      }),
    );
  }

  it("refuses a real organization even when purge flags point at it", async () => {
    const seeded = await seedChain("real-org", null, false);
    await expect(
      database.asService((db) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.demo_purge', 'on', true)`);
          await tx.execute(sql`SELECT set_config('app.demo_purge_org', ${seeded.orgId}, true)`);
          await tx.execute(sql`DELETE FROM organizations WHERE id = ${seeded.orgId}::uuid`);
        }),
      ),
    ).rejects.toThrow();
    const left = await database.asService(async (db) =>
      resultRows(await db.execute(sql`SELECT id FROM takeoff_detections WHERE id = ${seeded.detectionId}::uuid`)),
    );
    const proof = await database.asService(async (db) =>
      resultRows(await db.execute(sql`SELECT organization_id FROM demo_takeoff_purge_proof`)),
    );
    expect(left).toHaveLength(1);
    expect(proof).toHaveLength(0);
  });

  it("rejects a forged proof on a real organization", async () => {
    const seeded = await seedChain("forged-proof", null, false);
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO demo_takeoff_purge_proof (organization_id, nonce)
        VALUES (${seeded.orgId}::uuid, 'forged')
      `);
    });
    await expect(
      database.asService((db) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.demo_purge', 'on', true)`);
          await tx.execute(sql`SELECT set_config('app.demo_takeoff_purge_nonce', 'forged', true)`);
          await tx.execute(sql`DELETE FROM organizations WHERE id = ${seeded.orgId}::uuid`);
        }),
      ),
    ).rejects.toThrow();
    const left = await database.asService(async (db) =>
      resultRows(await db.execute(sql`SELECT id FROM organizations WHERE id = ${seeded.orgId}::uuid`)),
    );
    expect(left).toHaveLength(1);
  });

  it("rejects a template and a session that has no demo_sessions row", async () => {
    const template = await seedChain("template-only", "template", false);
    const session = await seedChain("session-only", "session", false);
    await expect(
      database.asService((db) => db.execute(sql`DELETE FROM organizations WHERE id = ${template.orgId}::uuid`)),
    ).rejects.toThrow();
    await expect(
      database.asService((db) => db.execute(sql`DELETE FROM organizations WHERE id = ${session.orgId}::uuid`)),
    ).rejects.toThrow();
  });

  it("rejects a direct detection delete even with a matching proof", async () => {
    const seeded = await seedChain("direct-delete", "session", true);
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO demo_takeoff_purge_proof (organization_id, nonce)
        VALUES (${seeded.orgId}::uuid, 'direct')
        ON CONFLICT (organization_id) DO UPDATE SET nonce = 'direct'
      `);
    });
    await expect(
      database.asService((db) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.demo_takeoff_purge_nonce', 'direct', true)`);
          await tx.execute(sql`DELETE FROM takeoff_detections WHERE id = ${seeded.detectionId}::uuid`);
        }),
      ),
    ).rejects.toThrow();
    const left = await database.asService(async (db) =>
      resultRows(await db.execute(sql`SELECT id FROM takeoff_detections WHERE id = ${seeded.detectionId}::uuid`)),
    );
    expect(left).toHaveLength(1);
  });

  it("deletes a marked session and leaves a real organization untouched", async () => {
    const session = await seedChain("session-ok", "session", true);
    const real = await seedChain("real-neighbor", null, false);
    await database.asService((db) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.demo_provisioner', 'on', true)`);
        await tx.execute(sql`DELETE FROM organizations WHERE id = ${session.orgId}::uuid`);
      }),
    );
    const sessionLeft = await database.asService(async (db) =>
      resultRows(await db.execute(sql`SELECT id FROM takeoff_detections WHERE organization_id = ${session.orgId}::uuid`)),
    );
    const realLeft = await database.asService(async (db) =>
      resultRows(await db.execute(sql`SELECT id FROM takeoff_detections WHERE id = ${real.detectionId}::uuid`)),
    );
    expect(sessionLeft).toHaveLength(0);
    expect(realLeft).toHaveLength(1);
  });
});
