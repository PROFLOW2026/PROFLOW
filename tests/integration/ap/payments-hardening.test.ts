import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createApBill,
  deleteVendorPayment,
  disableApPaymentsPersistenceForTests,
  enableApPaymentsPersistenceForTests,
  getBillPayablePosition,
  recordVendorPayment,
  rejectPaymentApplicationMutation,
  updateVendorPaymentMetadata,
  voidVendorPayment,
} from '@/modules/ap';
import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { money } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

const ILS = 'ILS';

/**
 * PRE-SQL Agent B scenarios (PGlite + Drizzle when readiness forced on):
 * A cross-tenant, D immutability, E void, F partial, G over-application, H currency.
 */
describe('AP vendor payments hardening (PGlite)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    enableApPaymentsPersistenceForTests();
  });

  afterAll(async () => {
    disableApPaymentsPersistenceForTests();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    enableApPaymentsPersistenceForTests();
  });

  async function seedBill(input: {
    readonly userId: string;
    readonly organizationId: string;
    readonly vendorName?: string;
    readonly totalAmount?: string;
    readonly currency?: string;
  }) {
    return database.asUser(input.userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: input.userId,
        organizationId: input.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, {
        name: input.vendorName ?? 'Supply Co',
      });
      const currency = (input.currency ?? ILS).toUpperCase();
      const totalAmount = input.totalAmount ?? '92000';
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency,
        totalAmount,
        billDate: '2026-08-01',
        lines: [
          {
            description: 'Materials',
            quantity: '1',
            unitAmount: totalAmount,
            lineTotal: totalAmount,
            currency,
          },
        ],
      });
      return { context, vendor, bill };
    });
  }

  it('A: Org A payment cannot reference Org B vendor/bill', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    const seededB = await seedBill({
      userId: userB.id,
      organizationId: orgB.organization.id,
      vendorName: 'Beta Vendor',
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return recordVendorPayment(context, {
          vendorId: seededB.vendor.id,
          amount: '50000',
          currency: ILS,
          paymentDate: '2026-08-10',
          applications: [{ apBillId: seededB.bill.id, appliedAmount: '50000' }],
        });
      }),
    ).rejects.toThrow(NotFoundError);

    const seededA = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      vendorName: 'Alpha Vendor',
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return recordVendorPayment(context, {
          vendorId: seededA.vendor.id,
          amount: '50000',
          currency: ILS,
          paymentDate: '2026-08-10',
          applications: [{ apBillId: seededB.bill.id, appliedAmount: '50000' }],
        });
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('D: cannot delete / rewrite financial fields; metadata allowed', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const { bill, vendor } = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
    });

    const recorded = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return recordVendorPayment(context, {
        vendorId: vendor.id,
        amount: '50000',
        currency: ILS,
        paymentDate: '2026-08-10',
        applications: [{ apBillId: bill.id, appliedAmount: '50000' }],
      });
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return deleteVendorPayment(context, recorded.payment.id);
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(() => rejectPaymentApplicationMutation()).toThrow(DomainRuleError);

    const meta = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return updateVendorPaymentMetadata(context, {
        paymentId: recorded.payment.id,
        method: 'transfer',
        reference: 'REF-1',
        notes: 'ok',
      });
    });
    expect(meta.method).toBe('transfer');
    expect(meta.amount).toBe(money('50000', ILS).amount);
    expect(meta.currency).toBe(ILS);
    expect(meta.vendorId).toBe(vendor.id);

    const still = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return getBillPayablePosition(context, bill.id);
    });
    expect(still?.paid).toBe(money('50000', ILS).amount);

    // Application rows remain after metadata edit (no silent rewrite/delete).
    const appCount = await database.asService(async (db) => {
      const result = await db.execute(sql`
        SELECT count(*)::int AS n
        FROM ap_payment_applications
        WHERE ap_payment_id = ${recorded.payment.id}::uuid
      `);
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: { n: number }[] }).rows ?? []);
      return Number((rows[0] as { n: number } | undefined)?.n ?? 0);
    });
    expect(appCount).toBe(1);
  });

  it('E: pay 50k on 92k → outstanding 42k; void → 92k; Actual stays 92k', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const { bill, vendor } = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '92000',
    });

    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: ['92000'],
      linkedExpenseAmounts: [],
    });
    expect(recognized.netRecognizedVendorActual.amount).toBe(money('92000', ILS).amount);

    const payment = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return recordVendorPayment(context, {
        vendorId: vendor.id,
        amount: '50000',
        currency: ILS,
        paymentDate: '2026-08-10',
        applications: [{ apBillId: bill.id, appliedAmount: '50000' }],
      });
    });

    const afterPay = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return getBillPayablePosition(context, bill.id);
    });
    expect(afterPay?.outstanding).toBe(money('42000', ILS).amount);
    expect(afterPay?.paid).toBe(money('50000', ILS).amount);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const voided = await voidVendorPayment(context, payment.payment.id);
      expect(voided.status).toBe('void');
      expect(voided.amount).toBe(money('50000', ILS).amount);
    });

    const afterVoid = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return getBillPayablePosition(context, bill.id);
    });
    expect(afterVoid?.outstanding).toBe(money('92000', ILS).amount);
    expect(afterVoid?.paid).toBe(money('0', ILS).amount);
    expect(recognized.netRecognizedVendorActual.amount).toBe(money('92000', ILS).amount);
  });

  it('F: 92k / 50k / 30k → outstanding 12k', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const { bill, vendor } = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '92000',
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await recordVendorPayment(context, {
        vendorId: vendor.id,
        amount: '50000',
        currency: ILS,
        paymentDate: '2026-08-10',
        applications: [{ apBillId: bill.id, appliedAmount: '50000' }],
      });
      await recordVendorPayment(context, {
        vendorId: vendor.id,
        amount: '30000',
        currency: ILS,
        paymentDate: '2026-08-11',
        applications: [{ apBillId: bill.id, appliedAmount: '30000' }],
      });
    });

    const position = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return getBillPayablePosition(context, bill.id);
    });
    expect(position?.outstanding).toBe(money('12000', ILS).amount);
    expect(position?.payableStatus).toBe('partial');
  });

  it('G: over-application cannot exceed payment or bill remaining', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const { bill, vendor } = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '92000',
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await recordVendorPayment(context, {
        vendorId: vendor.id,
        amount: '50000',
        currency: ILS,
        paymentDate: '2026-08-10',
        applications: [{ apBillId: bill.id, appliedAmount: '50000' }],
      });
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return recordVendorPayment(context, {
          vendorId: vendor.id,
          amount: '50000',
          currency: ILS,
          paymentDate: '2026-08-12',
          applications: [{ apBillId: bill.id, appliedAmount: '50000' }],
        });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return recordVendorPayment(context, {
          vendorId: vendor.id,
          amount: '30000',
          currency: ILS,
          paymentDate: '2026-08-12',
          applications: [{ apBillId: bill.id, appliedAmount: '20000' }],
        });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('H: currency mismatch (ILS≠USD) is rejected', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const { bill, vendor } = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '92000',
      currency: ILS,
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return recordVendorPayment(context, {
          vendorId: vendor.id,
          amount: '50000',
          currency: 'USD',
          paymentDate: '2026-08-10',
          applications: [{ apBillId: bill.id, appliedAmount: '50000' }],
        });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
