/**
 * S01 / OD-51 — inventory RLS with prepared 0192 on PGlite (Gate A; SQL not in journal).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  projectAccessGrants,
} from '@drizzle/schema';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { addOrgMember } from '@tests/setup/dg-fixtures';
import { grantRolePermission } from '@tests/setup/dg-fixtures-permissions';
import {
  applyPreparedMigrations,
  GATE_A_SEC_PREPARED_INVENTORY,
} from '@tests/setup/pending-journal-migrations';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { provisionTwoTenants } from '../projects/setup';

async function countInventory(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  table: 'inventory_items' | 'inventory_movements',
  projectId?: string,
): Promise<number> {
  const projectClause =
    projectId !== undefined ? ` AND project_id = '${projectId}'::uuid` : '';
  const rows = await database.asUser(userId, async (tx) =>
    resultRows<{ n: number }>(
      await tx.execute(
        sql.raw(
          `SELECT count(*)::int AS n FROM ${table} WHERE organization_id = '${organizationId}'::uuid${projectClause}`,
        ),
      ),
    ),
  );
  return rows[0]?.n ?? 0;
}

describe('RLS inventory 0192 prepared (adversarial)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_SEC_PREPARED_INVENTORY);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('denies worker without assets.read SELECT on inventory_items', async () => {
    const owner = await createTestUser(database, 'inv-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Inventory RLS Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'inv-worker', 'worker');
    const itemId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(inventoryItems).values({
        id: itemId,
        organizationId: tenant.organization.id,
        name: 'Bolt M12',
        unit: 'ea',
        quantityOnHand: '100',
      });
    });

    expect(await countInventory(database, worker.id, tenant.organization.id, 'inventory_items')).toBe(
      0,
    );
  });

  it('allows worker with assets.read grant to SELECT inventory_items', async () => {
    const owner = await createTestUser(database, 'inv-read-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Inventory Read Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'inv-read-worker', 'worker');
    await grantRolePermission(
      database,
      tenant.organization.id,
      'worker',
      PERMISSIONS.ASSETS_READ,
    );

    await database.asService(async (db) => {
      await db.insert(inventoryItems).values({
        id: randomUUID(),
        organizationId: tenant.organization.id,
        name: 'Cable',
        unit: 'm',
        quantityOnHand: '5',
      });
    });

    expect(await countInventory(database, worker.id, tenant.organization.id, 'inventory_items')).toBe(
      1,
    );
  });

  it('org B member cannot SELECT org A inventory (cross-tenant)', async () => {
    const { orgA, orgB, userB } = await provisionTwoTenants(database);
    await database.asService(async (db) => {
      await db.insert(inventoryItems).values({
        id: randomUUID(),
        organizationId: orgA.organization.id,
        name: 'Secret stock',
        unit: 'ea',
        quantityOnHand: '1',
      });
    });

    expect(await countInventory(database, userB.id, orgA.organization.id, 'inventory_items')).toBe(
      0,
    );
    expect(await countInventory(database, userB.id, orgB.organization.id, 'inventory_items')).toBe(0);
  });

  it('hides project-scoped movements without project context even with assets.read', async () => {
    const owner = await createTestUser(database, 'inv-move-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Movement Project Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'move-worker', 'worker');
    await grantRolePermission(
      database,
      tenant.organization.id,
      'worker',
      PERMISSIONS.ASSETS_READ,
    );
    const projectId = randomUUID();
    const itemId = randomUUID();
    const locationId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${tenant.organization.id}::uuid, 'Site', 'active', 'ILS')
      `);
      await db.insert(inventoryItems).values({
        id: itemId,
        organizationId: tenant.organization.id,
        name: 'Paint',
        unit: 'L',
        quantityOnHand: '10',
      });
      await db.insert(inventoryLocations).values({
        id: locationId,
        organizationId: tenant.organization.id,
        name: 'Main',
        code: 'MAIN',
      });
      await db.insert(inventoryMovements).values({
        id: randomUUID(),
        organizationId: tenant.organization.id,
        inventoryItemId: itemId,
        movementType: 'receive',
        quantity: '10',
        occurredOn: '2026-06-01',
        toLocationId: locationId,
      });
      await db.insert(inventoryMovements).values({
        id: randomUUID(),
        organizationId: tenant.organization.id,
        inventoryItemId: itemId,
        projectId,
        movementType: 'issue',
        quantity: '2',
        occurredOn: '2026-06-01',
        fromLocationId: locationId,
      });
    });

    expect(
      await countInventory(
        database,
        worker.id,
        tenant.organization.id,
        'inventory_movements',
        projectId,
      ),
    ).toBe(0);

    await database.asService(async (db) => {
      await db.insert(projectAccessGrants).values({
        organizationId: tenant.organization.id,
        userId: worker.id,
        projectId,
        accessLevel: 'read',
      });
    });

    expect(
      await countInventory(
        database,
        worker.id,
        tenant.organization.id,
        'inventory_movements',
        projectId,
      ),
    ).toBe(1);
  });

  it('denies worker INSERT on inventory_items; manager with assets.manage succeeds', async () => {
    const owner = await createTestUser(database, 'inv-write-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Inventory Write Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'write-worker', 'worker');
    const manager = await addOrgMember(database, tenant.organization.id, 'write-mgr', 'manager');

    let workerDenied = false;
    try {
      await database.asUser(worker.id, async (tx) =>
        tx.execute(
          sql`INSERT INTO inventory_items (id, organization_id, name, unit, quantity_on_hand)
              VALUES (${randomUUID()}::uuid, ${tenant.organization.id}::uuid, 'x', 'ea', 0)`,
        ),
      );
    } catch {
      workerDenied = true;
    }
    expect(workerDenied).toBe(true);

    const newId = randomUUID();
    await database.asUser(manager.id, async (tx) =>
      tx.execute(
        sql`INSERT INTO inventory_items (id, organization_id, name, unit, quantity_on_hand)
            VALUES (${newId}::uuid, ${tenant.organization.id}::uuid, 'Added', 'ea', 0)`,
      ),
    );

    const rows = await database.asUser(manager.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM inventory_items WHERE id = ${newId}::uuid AND organization_id = ${tenant.organization.id}::uuid`,
        ),
      ),
    );
    expect(rows.length).toBe(1);
  });

  it('0192 enables FORCE RLS on inventory_items and inventory_movements', async () => {
    const rows = await database.asService(async (db) =>
      resultRows<{ relname: string; relforcerowsecurity: boolean }>(
        await db.execute(sql`
          SELECT c.relname, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN ('inventory_items', 'inventory_movements')
          ORDER BY c.relname
        `),
      ),
    );
    expect(rows.map((r) => r.relname)).toEqual(['inventory_items', 'inventory_movements']);
    expect(rows.every((r) => r.relforcerowsecurity)).toBe(true);
  });
});
