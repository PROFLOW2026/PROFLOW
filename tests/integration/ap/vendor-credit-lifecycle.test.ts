import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { organizationMemberships } from '@drizzle/schema';
import {
  applyVendorCredit,
  createApBill,
  createVendorCredit,
  disableApPaymentsPersistenceForTests,
  enableApPaymentsPersistenceForTests,
  getBillPayablePosition,
  getVendorCredit,
  getVendorCreditDetail,
  listVendorCredits,
  postVendorCredit,
  updateVendorCredit,
  voidVendorCredit,
} from '@/modules/ap';
import { insertVendorCredit } from '@/modules/ap/data/credits.repository';
import {
  createApprovalRule,
  decideApprovalRequest,
  listApprovalRequests,
} from '@/modules/approvals';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { classifyApBillLines, findCostCategoryId } from '@tests/setup/cost-category-fixtures';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../billing/setup';

const ILS = 'ILS';

describe('vendor credit independent lifecycle (PGlite)', () => {
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

  async function seedVendorAndBill(input: {
    readonly userId: string;
    readonly organizationId: string;
    readonly totalAmount?: string;
  }) {
    const costCategoryId = await findCostCategoryId(database, input.organizationId);
    return database.asUser(input.userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: input.userId,
        organizationId: input.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Lifecycle Vendor' });
      const totalAmount = input.totalAmount ?? '50000';
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency: ILS,
        totalAmount,
        billDate: '2026-08-01',
        dueDate: '2026-09-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Materials',
              quantity: '1',
              unitAmount: totalAmount,
              lineTotal: totalAmount,
              currency: ILS,
            },
          ],
          costCategoryId,
        ),
      });
      return { context, vendor, bill };
    });
  }

  it('posts a draft credit to open without silent recognition before post', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedVendorAndBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const draft = await insertVendorCredit(tx, {
        organizationId: context.organizationId,
        vendorId: seeded.vendor.id,
        creditDate: businessDate('2026-08-02'),
        currency: ILS,
        amount: '8000',
        status: 'draft',
        reference: 'CN-DRAFT',
        notes: 'review me',
        createdByUserId: context.userId,
      });
      expect(draft.status).toBe('draft');

      const edited = await updateVendorCredit(context, {
        creditId: draft.id,
        amount: '9000',
        creditDate: '2026-08-03',
        reference: 'CN-DRAFT-2',
        notes: 'adjusted while draft',
      });
      expect(edited.status).toBe('draft');
      expect(edited.amount).toBe(money('9000', ILS).amount);
      expect(edited.reference).toBe('CN-DRAFT-2');

      const posted = await postVendorCredit(context, draft.id);
      expect(posted.status).toBe('open');

      await expect(
        updateVendorCredit(context, {
          creditId: draft.id,
          amount: '1000',
          creditDate: '2026-08-03',
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(postVendorCredit(context, draft.id)).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('blocks post while approval is pending, then posts after approve', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedVendorAndBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      await createApprovalRule(context, {
        name: 'Vendor credits',
        entityType: 'vendor_credit',
        thresholdAmount: null,
        currency: ILS,
        enabled: true,
      });

      const credit = await createVendorCredit(context, {
        vendorId: seeded.vendor.id,
        creditDate: '2026-08-04',
        currency: ILS,
        amount: '2500',
        reference: 'CN-APPR',
      });
      expect(credit.status).toBe('draft');

      const detail = await getVendorCreditDetail(context, credit.id);
      expect(detail?.displayStatus).toBe('pending_approval');

      await expect(postVendorCredit(context, credit.id)).rejects.toBeInstanceOf(DomainRuleError);

      const requests = await listApprovalRequests(context, {
        entityType: 'vendor_credit',
        status: 'submitted',
      });
      const request = requests.find((row) => row.entityId === credit.id);
      expect(request).toBeTruthy();

      await decideApprovalRequest(context, {
        requestId: request!.id,
        decision: 'approved',
      });

      const posted = await postVendorCredit(context, credit.id);
      expect(posted.status).toBe('open');
      const after = await getVendorCreditDetail(context, credit.id);
      expect(after?.displayStatus).toBe('open');
    });
  });

  it('voids an applied credit, unwinds applications, and keeps history', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedVendorAndBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
      totalAmount: '40000',
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const credit = await createVendorCredit(context, {
        vendorId: seeded.vendor.id,
        apBillId: seeded.bill.id,
        creditDate: '2026-08-05',
        currency: ILS,
        amount: '10000',
        reference: 'CN-VOID',
      });
      expect(credit.status).toBe('draft');
      await postVendorCredit(context, credit.id);

      await applyVendorCredit(context, {
        creditId: credit.id,
        apBillId: seeded.bill.id,
        amount: '10000',
      });

      const afterApply = await getBillPayablePosition(context, seeded.bill.id);
      expect(afterApply?.credited).toBe(money('10000', ILS).amount);
      expect(afterApply?.outstanding).toBe(money('30000', ILS).amount);

      const applied = await getVendorCredit(context, credit.id);
      expect(applied?.status).toBe('applied');

      const voided = await voidVendorCredit(context, { creditId: credit.id });
      expect(voided.status).toBe('void');
      expect(voided.voidedAt).toBeTruthy();

      const stillThere = await getVendorCredit(context, credit.id);
      expect(stillThere?.status).toBe('void');

      const afterVoid = await getBillPayablePosition(context, seeded.bill.id);
      expect(afterVoid?.credited).toBe(money('0', ILS).amount);
      expect(afterVoid?.outstanding).toBe(money('40000', ILS).amount);

      const detail = await getVendorCreditDetail(context, credit.id);
      expect(detail?.displayStatus).toBe('void');
      expect(detail?.applications).toHaveLength(1);
      expect(detail?.applications[0]?.application.status).toBe('void');
      expect(detail?.appliedTotal).toBe(money('0', ILS).amount);

      await expect(voidVendorCredit(context, { creditId: credit.id })).rejects.toBeInstanceOf(
        DomainRuleError,
      );
    });
  });

  it('lets AP_READ list credits and blocks AP_MANAGE-only void', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedVendorAndBill({
      userId: userA.id,
      organizationId: orgA.organization.id,
    });

    const creditId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const credit = await createVendorCredit(context, {
        vendorId: seeded.vendor.id,
        creditDate: '2026-08-06',
        currency: ILS,
        amount: '1200',
      });
      return credit.id;
    });

    const financeUser = await createTestUser(database, 'finance-credit@example.test');
    await database.asService(async (db) => {
      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgA.organization.id,
        userId: financeUser.id,
        status: 'active',
      });
      const financeRole = await findRoleByKey(db, orgA.organization.id, 'finance');
      if (!financeRole) throw new Error('Finance role not found');
      await assignRole(db, {
        organizationId: orgA.organization.id,
        membershipId,
        userId: financeUser.id,
        roleId: financeRole.id,
      });
    });

    await database.asUser(financeUser.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: financeUser.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const list = await listVendorCredits(context);
      expect(list.some((row) => row.id === creditId)).toBe(true);

      await expect(voidVendorCredit(context, { creditId })).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      await expect(postVendorCredit(context, creditId)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
