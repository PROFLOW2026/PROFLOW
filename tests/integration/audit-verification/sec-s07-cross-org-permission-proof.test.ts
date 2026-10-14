/**
 * S07 — demonstrated security: cross-org isolation + permission tiers with Gate A prepared SEC stack.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, inventoryItems } from '@drizzle/schema';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { addOrgMember } from '@tests/setup/dg-fixtures';
import {
  applyPreparedMigrations,
  GATE_A_SEC_PREPARED_ADVERSARIAL,
} from '@tests/setup/pending-journal-migrations';
import { provisionTwoTenants } from '../projects/setup';

describe('S07 cross-org and permission-tier RLS proof (0184–0186 + 0192 prepared)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_SEC_PREPARED_ADVERSARIAL);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('org B user sees zero rows when targeting org A tables by organization_id', async () => {
    const { orgA, orgB, userB } = await provisionTwoTenants(database);
    const auditId = randomUUID();
    const itemId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(auditEvents).values({
        id: auditId,
        organizationId: orgA.organization.id,
        actorUserId: orgA.owner.id,
        action: 'inventory.adjusted',
        entityType: 'inventory_item',
        entityId: itemId,
        before: {},
        after: {},
      });
      await db.insert(inventoryItems).values({
        id: itemId,
        organizationId: orgA.organization.id,
        name: 'Cross-org probe',
        unit: 'ea',
        quantityOnHand: '3',
      });
    });

    const workerB = await addOrgMember(database, orgB.organization.id, 's07-worker', 'worker');

    const auditRows = await database.asUser(userB.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM audit_events WHERE organization_id = ${orgA.organization.id}::uuid`,
        ),
      ),
    );
    expect(auditRows.length).toBe(0);

    const invRows = await database.asUser(workerB.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM inventory_items WHERE organization_id = ${orgA.organization.id}::uuid`,
        ),
      ),
    );
    expect(invRows.length).toBe(0);
  });

  it('same-org owner sees inventory; worker without assets.read does not (0192 tier)', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const worker = await addOrgMember(database, orgA.organization.id, 's07-inv', 'worker');
    const itemId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(inventoryItems).values({
        id: itemId,
        organizationId: orgA.organization.id,
        name: 'Tier probe',
        unit: 'ea',
        quantityOnHand: '1',
      });
    });

    const ownerRows = await database.asUser(userA.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM inventory_items WHERE organization_id = ${orgA.organization.id}::uuid`,
        ),
      ),
    );
    expect(ownerRows.length).toBe(1);

    const workerRows = await database.asUser(worker.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM inventory_items WHERE organization_id = ${orgA.organization.id}::uuid`,
        ),
      ),
    );
    expect(workerRows.length).toBe(0);
  });
});
