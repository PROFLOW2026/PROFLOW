import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apBills, expenses } from '@drizzle/schema';
import {
  createInventoryCount,
  createInventoryItem,
  finalizeInventoryCount,
  getInventoryItemById,
  listInventoryLocationsForOrg,
  listInventoryReservationsForOrg,
  listLowStockItems,
  listMovementsForInventoryItem,
  recordInventoryMovement,
  releaseInventoryReservation,
  reserveInventory,
  upsertInventoryCountLine,
} from '@/modules/assets';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

describe('advanced inventory (reservations, counts, low stock)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('reserves available qty, rejects over-reserve, and consumes on issue', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });

      const item = await createInventoryItem(context, {
        name: 'Pipe 50mm',
        unit: 'm',
        quantityOnHand: '10',
        minStockLevel: '3',
        barcode: 'PF-PIPE-50',
      });
      const project = await createProject(context, { name: 'Site A' });

      const reserved = await reserveInventory(context, {
        inventoryItemId: item.id,
        quantity: '4',
        projectId: project.projectId,
      });
      expect(reserved.status).toBe('active');
      expect(reserved.quantity).toBe('4.000000');

      const afterReserve = await getInventoryItemById(context, item.id);
      expect(afterReserve?.quantityOnHand).toBe('10.000000');
      expect(afterReserve?.reservedQuantity).toBe('4.000000');
      expect(afterReserve?.availableQuantity).toBe('6.000000');

      await expect(
        reserveInventory(context, {
          inventoryItemId: item.id,
          quantity: '7',
          projectId: project.projectId,
        }),
      ).rejects.toMatchObject({ messageKey: 'assets.errors.insufficientAvailable' });

      await expect(
        recordInventoryMovement(context, {
          inventoryItemId: item.id,
          movementType: 'issue',
          quantity: '7',
          occurredOn: '2026-08-14',
        }),
      ).rejects.toMatchObject({ messageKey: 'assets.errors.insufficientAvailable' });

      const issued = await recordInventoryMovement(context, {
        inventoryItemId: item.id,
        movementType: 'issue',
        quantity: '4',
        occurredOn: '2026-08-14',
        reservationId: reserved.id,
        projectId: project.projectId,
      });
      expect(issued.item.quantityOnHand).toBe('6.000000');
      expect(issued.movement.projectId).toBe(project.projectId);
      expect(issued.movement.movementType).toBe('issue');

      const afterIssue = await getInventoryItemById(context, item.id);
      expect(afterIssue?.reservedQuantity).toBe('0.000000');
      expect(afterIssue?.availableQuantity).toBe('6.000000');

      const active = await listInventoryReservationsForOrg(context, { activeOnly: true });
      expect(active).toHaveLength(0);
    });
  });

  it('releases a reservation back to available', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const item = await createInventoryItem(context, {
        name: 'Tape',
        quantityOnHand: '5',
      });
      const project = await createProject(context, { name: 'Job' });
      const reserved = await reserveInventory(context, {
        inventoryItemId: item.id,
        quantity: '2',
        projectId: project.projectId,
      });
      const released = await releaseInventoryReservation(context, {
        reservationId: reserved.id,
      });
      expect(released.status).toBe('released');
      const after = await getInventoryItemById(context, item.id);
      expect(after?.availableQuantity).toBe('5.000000');

      const again = await releaseInventoryReservation(context, {
        reservationId: reserved.id,
      });
      expect(again.status).toBe('released');
      expect(again.id).toBe(released.id);
    });
  });

  it('finalizes a stock count into adjust movements, not Actual', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const orgId = context.organizationId;
      const item = await createInventoryItem(context, {
        name: 'Cable',
        quantityOnHand: '10',
      });
      const locations = await listInventoryLocationsForOrg(context);
      const locationId = locations[0]!.id;

      const stockCount = await createInventoryCount(context, {
        locationId,
        countedOn: '2026-08-14',
      });
      await upsertInventoryCountLine(context, {
        countId: stockCount.id,
        inventoryItemId: item.id,
        countedQuantity: '8',
      });

      const finalized = await finalizeInventoryCount(context, { countId: stockCount.id });
      expect(finalized.count.status).toBe('finalized');
      expect(finalized.movementIds).toHaveLength(1);

      const after = await getInventoryItemById(context, item.id);
      expect(after?.quantityOnHand).toBe('8.000000');

      const history = await listMovementsForInventoryItem(context, item.id);
      const adjust = history.find((row) => row.notes?.includes(stockCount.id));
      expect(adjust?.movementType).toBe('adjust');
      expect(adjust?.quantity).toBe('-2.000000');

      const [expenseRow] = await tx
        .select({ n: count() })
        .from(expenses)
        .where(eq(expenses.organizationId, orgId));
      const [apRow] = await tx
        .select({ n: count() })
        .from(apBills)
        .where(eq(apBills.organizationId, orgId));
      expect(Number(expenseRow?.n ?? 0)).toBe(0);
      expect(Number(apRow?.n ?? 0)).toBe(0);

      const again = await finalizeInventoryCount(context, { countId: stockCount.id });
      expect(again.count.status).toBe('finalized');
      expect(again.movementIds).toEqual(finalized.movementIds);
      const afterRetry = await getInventoryItemById(context, item.id);
      expect(afterRetry?.quantityOnHand).toBe('8.000000');
      const adjustMovements = (await listMovementsForInventoryItem(context, item.id)).filter(
        (row) => row.notes?.includes(stockCount.id),
      );
      expect(adjustMovements).toHaveLength(1);
    });
  });

  it('listLowStockItems uses min_stock_level and stays tenant-scoped', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const itemId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const low = await createInventoryItem(context, {
        name: 'Low bolt',
        quantityOnHand: '1',
        minStockLevel: '5',
        barcode: 'LOW-1',
      });
      await createInventoryItem(context, {
        name: 'OK bolt',
        quantityOnHand: '9',
        minStockLevel: '5',
      });
      const listed = await listLowStockItems(context);
      expect(listed.map((row) => row.id)).toEqual([low.id]);
      expect(listed[0]?.suggestedReorder).toBe(true);
      return low.id;
    });

    await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      const listed = await listLowStockItems(context);
      expect(listed.map((row) => row.id)).not.toContain(itemId);
      await expect(getInventoryItemById(context, itemId)).resolves.toBeNull();
      await expect(
        reserveInventory(context, {
          inventoryItemId: itemId,
          quantity: '1',
          projectId: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('does not leak reservations across tenants', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const reservationId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const item = await createInventoryItem(context, {
        name: 'Secret stock',
        quantityOnHand: '4',
      });
      const project = await createProject(context, { name: 'Secret' });
      const reserved = await reserveInventory(context, {
        inventoryItemId: item.id,
        quantity: '1',
        projectId: project.projectId,
      });
      return reserved.id;
    });

    await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      const listed = await listInventoryReservationsForOrg(context);
      expect(listed.map((row) => row.id)).not.toContain(reservationId);
      await expect(
        releaseInventoryReservation(context, { reservationId }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
