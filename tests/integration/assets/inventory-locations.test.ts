import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apBills, expenses } from '@drizzle/schema';
import {
  createInventoryItem,
  createInventoryLocation,
  DEFAULT_INVENTORY_LOCATION_NAME_HE,
  getInventoryItemById,
  listInventoryLocationsForOrg,
  listMovementsForInventoryItem,
  recordInventoryMovement,
  sumQuantities,
} from '@/modules/assets';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

describe('inventory locations (qty-only)', () => {
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

  it('receives, issues, transfers, and adjusts without creating expense or AP', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const orgId = context.organizationId;

      const item = await createInventoryItem(context, {
        name: 'Cable 3x2.5',
        unit: 'm',
        quantityOnHand: '0',
      });

      const received = await recordInventoryMovement(context, {
        inventoryItemId: item.id,
        movementType: 'receive',
        quantity: '10',
        occurredOn: '2026-08-14',
      });

      const locations = await listInventoryLocationsForOrg(context);
      expect(locations).toHaveLength(1);
      expect(locations[0]!.name).toBe(DEFAULT_INVENTORY_LOCATION_NAME_HE);
      const mainId = locations[0]!.id;
      expect(received.movement.toLocationId).toBe(mainId);
      expect(received.item.quantityOnHand).toBe('10.000000');

      const yard = await createInventoryLocation(context, {
        name: 'חצר',
        code: 'YARD',
      });

      const transferred = await recordInventoryMovement(context, {
        inventoryItemId: item.id,
        movementType: 'transfer',
        quantity: '4',
        occurredOn: '2026-08-14',
        fromLocationId: mainId,
        toLocationId: yard.id,
      });
      expect(transferred.item.quantityOnHand).toBe('10.000000');
      expect(transferred.movement.fromLocationId).toBe(mainId);
      expect(transferred.movement.toLocationId).toBe(yard.id);

      const project = await createProject(context, { name: 'Site A' });
      const issued = await recordInventoryMovement(context, {
        inventoryItemId: item.id,
        movementType: 'issue',
        quantity: '2',
        occurredOn: '2026-08-14',
        fromLocationId: mainId,
        projectId: project.projectId,
      });
      expect(issued.item.quantityOnHand).toBe('8.000000');
      expect(issued.movement.projectId).toBe(project.projectId);
      expect(issued.movement.fromLocationId).toBe(mainId);

      const adjusted = await recordInventoryMovement(context, {
        inventoryItemId: item.id,
        movementType: 'adjust',
        quantity: '1',
        occurredOn: '2026-08-14',
        locationId: yard.id,
      });
      expect(adjusted.item.quantityOnHand).toBe('9.000000');
      expect(adjusted.movement.toLocationId).toBe(yard.id);

      const detailed = await getInventoryItemById(context, item.id);
      expect(detailed).not.toBeNull();
      const balanceSum = sumQuantities(detailed!.locationBalances.map((row) => row.quantity));
      expect(detailed!.quantityOnHand).toBe(balanceSum);
      expect(detailed!.quantityOnHand).toBe('9.000000');

      const mainBalance = detailed!.locationBalances.find((row) => row.locationId === mainId);
      const yardBalance = detailed!.locationBalances.find((row) => row.locationId === yard.id);
      expect(mainBalance?.quantity).toBe('4.000000');
      expect(yardBalance?.quantity).toBe('5.000000');

      await expect(
        recordInventoryMovement(context, {
          inventoryItemId: item.id,
          movementType: 'issue',
          quantity: '50',
          occurredOn: '2026-08-14',
          fromLocationId: mainId,
        }),
      ).rejects.toMatchObject({
        messageKey: 'assets.errors.insufficientQuantity',
      });

      await expect(
        recordInventoryMovement(context, {
          inventoryItemId: item.id,
          movementType: 'transfer',
          quantity: '50',
          occurredOn: '2026-08-14',
          fromLocationId: mainId,
          toLocationId: yard.id,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      const afterNegative = await getInventoryItemById(context, item.id);
      expect(afterNegative?.quantityOnHand).toBe('9.000000');

      const history = await listMovementsForInventoryItem(context, item.id);
      expect(history.some((row) => row.movementType === 'transfer' && row.fromLocationName)).toBe(
        true,
      );
      expect(history.some((row) => row.toLocationName === DEFAULT_INVENTORY_LOCATION_NAME_HE)).toBe(
        true,
      );

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
    });
  });
});
