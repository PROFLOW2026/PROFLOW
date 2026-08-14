import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyVendorCredit,
  composeVendorCostRecognition,
  createApBill,
  createVendorCredit,
  postVendorCredit,
  enableApPaymentsPersistenceForTests,
  disableApPaymentsPersistenceForTests,
  getBillPayablePosition,
  isVendorBillExcludedFromActual,
  listVendorPaymentsForBill,
  netRecognizedBillAfterCredits,
  recordVendorPayment,
  voidApBill,
  voidVendorPayment,
} from '@/modules/ap';
import { loadRecognizedVendorBillsForProject } from '@/modules/financials/data/committed-costs.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { createProject } from '@/modules/projects';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

const ILS = 'ILS';

/**
 * Wave F — void + credit economics (PGlite).
 * Credits ≠ payments; void exits Actual; credits reduce Actual + outstanding.
 */
describe('AP void + credit economics (PGlite)', () => {
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
    readonly totalAmount?: string;
    readonly withProject?: boolean;
  }) {
    return database.asUser(input.userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: input.userId,
        organizationId: input.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Credit Vendor' });
      let projectId: string | undefined;
      if (input.withProject) {
        const created = await createProject(context, {
          name: 'AP Economics Project',
        });
        projectId = created.projectId;
      }
      const totalAmount = input.totalAmount ?? '100000';
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        projectId,
        currency: ILS,
        totalAmount,
        billDate: '2026-08-01',
        dueDate: '2026-09-01',
        lines: [
          {
            description: 'Materials',
            quantity: '1',
            unitAmount: totalAmount,
            lineTotal: totalAmount,
            currency: ILS,
          },
        ],
      });
      return { context, vendor, bill, projectId };
    });
  }

  it('blocks void while active payments exist; allows after payment void', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '50000',
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await recordVendorPayment(context, {
        amount: '10000',
        currency: ILS,
        paymentDate: '2026-08-10',
        applications: [{ apBillId: seeded.bill.id, appliedAmount: '10000' }],
      });
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return voidApBill(context, { billId: seeded.bill.id });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const position = await getBillPayablePosition(context, seeded.bill.id);
      expect(position?.outstanding).toBe(money('40000', ILS).amount);

      const payments = await listVendorPaymentsForBill(context, seeded.bill.id);
      const recorded = payments.find((p) => p.payment.status === 'recorded');
      expect(recorded).toBeTruthy();
      await voidVendorPayment(context, recorded!.payment.id);

      const voided = await voidApBill(context, { billId: seeded.bill.id });
      expect(voided.status).toBe('void');
      expect(isVendorBillExcludedFromActual(voided.status)).toBe(true);

      const after = await getBillPayablePosition(context, seeded.bill.id);
      expect(after?.outstanding).toBe(money('0', ILS).amount);
      expect(after?.payableStatus).toBeNull();
    });
  });

  it('credit reduces outstanding and Actual; payment does not reduce Actual', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '100000',
      withProject: true,
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      // Payment: cash only — Actual still full bill.
      await recordVendorPayment(context, {
        amount: '20000',
        currency: ILS,
        paymentDate: '2026-08-12',
        applications: [{ apBillId: seeded.bill.id, appliedAmount: '20000' }],
      });

      const afterPay = await getBillPayablePosition(context, seeded.bill.id);
      expect(afterPay?.paid).toBe(money('20000', ILS).amount);
      expect(afterPay?.outstanding).toBe(money('80000', ILS).amount);

      const recognitionAfterPay = composeVendorCostRecognition({
        currency: ILS,
        recognizedBillAmounts: [seeded.bill.totalAmount],
        linkedExpenseAmounts: [],
      });
      expect(recognitionAfterPay.netRecognizedVendorActual).toEqual(money('100000', ILS));

      // Credit: reduces outstanding AND Actual.
      const credit = await createVendorCredit(context, {
        vendorId: seeded.vendor.id,
        apBillId: seeded.bill.id,
        projectId: seeded.projectId,
        creditDate: '2026-08-15',
        currency: ILS,
        amount: '15000',
        reference: 'CN-1',
      });
      await postVendorCredit(context, credit.id);
      await applyVendorCredit(context, {
        creditId: credit.id,
        apBillId: seeded.bill.id,
        amount: '15000',
      });

      const afterCredit = await getBillPayablePosition(context, seeded.bill.id);
      expect(afterCredit?.credited).toBe(money('15000', ILS).amount);
      expect(afterCredit?.outstanding).toBe(money('65000', ILS).amount);
      expect(afterCredit?.paid).toBe(money('20000', ILS).amount);

      const netActual = netRecognizedBillAfterCredits({
        currency: ILS,
        billNetAmount: seeded.bill.netAmount ?? seeded.bill.totalAmount,
        creditActualReductions: ['15000'],
      });
      expect(netActual).toEqual(money('85000', ILS));

      const rollup = await loadRecognizedVendorBillsForProject(
        tx,
        orgA.organization.id,
        seeded.projectId!,
        ILS,
      );
      expect(rollup.total).toEqual(money('85000', ILS));
    });
  });

  it('domain net after full credit is zero Actual', () => {
    expect(
      netRecognizedBillAfterCredits({
        currency: ILS,
        billNetAmount: '42000',
        creditActualReductions: ['42000'],
      }),
    ).toEqual(money('0', ILS));
  });
});
