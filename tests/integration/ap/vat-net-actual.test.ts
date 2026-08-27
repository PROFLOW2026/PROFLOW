import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApBill, createDraftApBill, getBillPayablePosition } from '@/modules/ap';
import { loadRecognizedVendorBillsForProject } from '@/modules/financials/data/committed-costs.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { createProject } from '@/modules/projects';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

const ILS = 'ILS';

describe('AP VAT: Actual NET vs payable GROSS', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database?.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('VAT-inclusive vendor bill recognizes NET Actual and GROSS payable', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { billId, projectId } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'VAT Vendor' });
      const project = await createProject(context, { name: 'VAT Project' });
      const categoryRows = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id=${orgA.organization.id}::uuid AND key='materials' LIMIT 1
        `),
      );
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        projectId: project.projectId,
        currency: ILS,
        totalAmount: '117',
        amountIncludesTax: true,
        netAmount: '100',
        taxAmount: '17',
        billDate: '2026-08-01',
        lines: [
          {
            description: 'VAT-inclusive materials',
            quantity: '1',
            unitAmount: '117',
            lineTotal: '117',
            currency: ILS,
            costCategoryId: categoryRows[0]!.id,
            costFamily: 'direct_project',
          },
        ],
      });
      return { billId: bill.id, projectId: project.projectId };
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const recognized = await loadRecognizedVendorBillsForProject(
        context.db,
        context.organizationId,
        projectId,
        ILS,
      );
      expect(Number(recognized.total.amount)).toBe(100);

      const payable = await getBillPayablePosition(context, billId);
      expect(payable).not.toBeNull();
      expect(Number(payable!.billTotal)).toBe(117);
      expect(Number(payable!.outstanding)).toBe(117);
    });
  });

  it('createDraftApBill does not enter Actual', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { bill, projectId } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Draft Vendor' });
      const project = await createProject(context, { name: 'Draft Project' });
      const created = await createDraftApBill(context, {
        vendorId: vendor.id,
        projectId: project.projectId,
        currency: ILS,
        totalAmount: '50',
        billDate: '2026-08-01',
        lines: [
          {
            description: 'Draft only',
            quantity: '1',
            unitAmount: '50',
            lineTotal: '50',
            currency: ILS,
          },
        ],
      });
      return { bill: created, projectId: project.projectId };
    });

    expect(bill.status).toBe('draft');

    await database.asUser(userA.id, async (tx) => {
      const recognized = await loadRecognizedVendorBillsForProject(
        tx,
        orgA.organization.id,
        projectId,
        ILS,
      );
      expect(Number(recognized.total.amount)).toBe(0);
    });
  });
});
