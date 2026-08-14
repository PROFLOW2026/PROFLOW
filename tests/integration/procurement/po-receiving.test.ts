import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { apBills, committedCosts, expenses, inventoryMovements } from '@drizzle/schema';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrderById,
  issuePurchaseOrder,
  listPurchaseOrderReceipts,
  receivePurchaseOrder,
} from '@/modules/procurement';
import { createVendor } from '@/modules/vendors';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTwoTenantScenario, type TwoTenantScenario } from '@tests/setup/fixtures';

async function issuedPurchaseOrder(
  context: Awaited<ReturnType<typeof resolveOrgContext>>,
  quantity: string,
) {
  const vendor = await createVendor(context, { name: `Vendor ${randomUUID()}` });
  const draft = await createPurchaseOrder(context, {
    vendorId: vendor.id,
    currency: 'ILS',
    committedAmount: '100',
    lines: [
      {
        description: 'Cable',
        quantity,
        unitAmount: '10',
        lineTotal: '100',
        currency: 'ILS',
      },
    ],
  });
  const issued = await issuePurchaseOrder(context, { purchaseOrderId: draft.id });
  const detail = await getPurchaseOrderById(context, issued.id);
  return { vendor, order: issued, lines: detail.lines };
}

describe('PO receiving', () => {
  let database: TestDatabase;
  let tenants: TwoTenantScenario;

  beforeAll(async () => {
    database = await createTestDatabase();
    tenants = await createTwoTenantScenario(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('blocks receiving more than remaining quantity', async () => {
    await database.asUser(tenants.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenants.userA.id,
        organizationId: tenants.orgA.organization.id,
        locale: 'en',
      });
      const { order, lines } = await issuedPurchaseOrder(context, '10');
      await expect(
        receivePurchaseOrder(context, {
          purchaseOrderId: order.id,
          receivedOn: '2026-08-14',
          lines: [{ purchaseOrderLineId: lines[0]!.id, quantity: '11' }],
        }),
      ).rejects.toMatchObject({
        messageKey: 'procurement.errors.quantityExceedsRemaining',
      });
      expect(await listPurchaseOrderReceipts(context, order.id)).toEqual([]);
    });
  });

  it('blocks receiving a cancelled purchase order', async () => {
    await database.asUser(tenants.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenants.userA.id,
        organizationId: tenants.orgA.organization.id,
        locale: 'en',
      });
      const { order, lines } = await issuedPurchaseOrder(context, '4');
      await cancelPurchaseOrder(context, { purchaseOrderId: order.id });
      await expect(
        receivePurchaseOrder(context, {
          purchaseOrderId: order.id,
          receivedOn: '2026-08-14',
          lines: [{ purchaseOrderLineId: lines[0]!.id, quantity: '1' }],
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('blocks cross-organization receive', async () => {
    const poId = await database.asUser(tenants.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenants.userA.id,
        organizationId: tenants.orgA.organization.id,
        locale: 'en',
      });
      const { order } = await issuedPurchaseOrder(context, '8');
      return order.id;
    });

    await expect(
      database.asUser(tenants.userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenants.userB.id,
          organizationId: tenants.orgB.organization.id,
          locale: 'en',
        });
        return receivePurchaseOrder(context, {
          purchaseOrderId: poId,
          receivedOn: '2026-08-14',
          lines: [{ purchaseOrderLineId: poId, quantity: '1' }],
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('moves issued to partially_received and keeps that status when fully received', async () => {
    await database.asUser(tenants.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenants.userA.id,
        organizationId: tenants.orgA.organization.id,
        locale: 'en',
      });
      const { order, lines } = await issuedPurchaseOrder(context, '10');
      expect(order.status).toBe('issued');

      const partial = await receivePurchaseOrder(context, {
        purchaseOrderId: order.id,
        receivedOn: '2026-08-14',
        lines: [{ purchaseOrderLineId: lines[0]!.id, quantity: '4' }],
      });
      expect(partial.order.status).toBe('partially_received');
      expect(Number(partial.remainingLines[0]!.remainingQuantity)).toBe(6);

      const full = await receivePurchaseOrder(context, {
        purchaseOrderId: order.id,
        receivedOn: '2026-08-15',
        reference: 'DN-1',
        lines: [{ purchaseOrderLineId: lines[0]!.id, quantity: '6' }],
      });
      expect(full.order.status).toBe('partially_received');
      expect(full.fullyReceived).toBe(true);
      expect(Number(full.remainingLines[0]!.remainingQuantity)).toBe(0);

      const receipts = await listPurchaseOrderReceipts(context, order.id);
      expect(receipts).toHaveLength(2);
      expect(receipts[0]!.receivedOn).toBe('2026-08-15');
    });
  });

  it('does not insert expense, AP bill, or inventory actual when receiving', async () => {
    await database.asUser(tenants.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenants.userA.id,
        organizationId: tenants.orgA.organization.id,
        locale: 'en',
      });
      const orgId = context.organizationId;
      const [expenseBefore] = await tx.select({ n: count() }).from(expenses).where(eq(expenses.organizationId, orgId));
      const [apBefore] = await tx.select({ n: count() }).from(apBills).where(eq(apBills.organizationId, orgId));
      const [invBefore] = await tx
        .select({ n: count() })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.organizationId, orgId));

      const { order, lines } = await issuedPurchaseOrder(context, '3');
      await receivePurchaseOrder(context, {
        purchaseOrderId: order.id,
        receivedOn: '2026-08-14',
        lines: [{ purchaseOrderLineId: lines[0]!.id, quantity: '3' }],
      });

      const [expenseAfter] = await tx.select({ n: count() }).from(expenses).where(eq(expenses.organizationId, orgId));
      const [apAfter] = await tx.select({ n: count() }).from(apBills).where(eq(apBills.organizationId, orgId));
      const [invAfter] = await tx
        .select({ n: count() })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.organizationId, orgId));
      const [committed] = await tx
        .select()
        .from(committedCosts)
        .where(eq(committedCosts.purchaseOrderId, order.id));

      expect(Number(expenseAfter?.n ?? 0)).toBe(Number(expenseBefore?.n ?? 0));
      expect(Number(apAfter?.n ?? 0)).toBe(Number(apBefore?.n ?? 0));
      expect(Number(invAfter?.n ?? 0)).toBe(Number(invBefore?.n ?? 0));
      expect(committed?.status).toBe('open');
    });
  });
});
