import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApBill, getVendorApOutstanding } from '@/modules/ap';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createSubcontract, createVendor, listVendorSubcontracts } from '@/modules/vendors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { classifyApBillLines, findCostCategoryId } from '../../setup/cost-category-fixtures';
import { createTestUser, seedSystem } from '../../setup/fixtures';
import { createOrganization } from '@/modules/tenancy';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string; code?: string };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function provisionTenant(database: TestDatabase, email: string, orgName: string) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: orgName, countryCode: 'IL' }),
  );
  return { owner, organizationId: result.organization.id };
}

describe('AP subcontract agreement guard and outstanding', () => {
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

  it('rejects a vendor bill whose agreement vendor or project does not match', async () => {
    const tenant = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const costCategoryId = await findCostCategoryId(database, tenant.organizationId);

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        const vendorA = await createVendor(context, { name: 'Site Electric', type: 'subcontractor' });
        const vendorB = await createVendor(context, { name: 'Other Trade', type: 'subcontractor' });
        const { projectId } = await createProject(context, { name: 'Tower A' });
        const agreement = await createSubcontract(context, {
          title: 'Electrical package',
          vendorId: vendorA.id,
          projectId,
          originalAmount: '100000',
        });
        await createApBill(context, {
          vendorId: vendorB.id,
          projectId,
          currency: context.organization.baseCurrency,
          totalAmount: '1000',
          billDate: '2026-08-01',
          subcontractAgreementId: agreement.id,
          lines: classifyApBillLines(
            [
              {
                description: 'Mismatch',
                quantity: '1',
                unitAmount: '1000',
                lineTotal: '1000',
                currency: context.organization.baseCurrency,
              },
            ],
            costCategoryId,
          ),
        });
      }),
    ).rejects.toSatisfy((error) =>
      /vendor mismatch|vendor must match|check_violation|23514|Failed query|DomainRuleError/i.test(
        errorBlob(error),
      ),
    );
  });

  it('isolates billed/outstanding to the tagged subcontract agreement', async () => {
    const tenant = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const costCategoryId = await findCostCategoryId(database, tenant.organizationId);

    const result = await database.asUser(tenant.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenant.owner.id,
        organizationId: tenant.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Site Electric', type: 'subcontractor' });
      const { projectId } = await createProject(context, { name: 'Tower A' });
      const agreementA = await createSubcontract(context, {
        title: 'Package A',
        vendorId: vendor.id,
        projectId,
        originalAmount: '80000',
      });
      const agreementB = await createSubcontract(context, {
        title: 'Package B',
        vendorId: vendor.id,
        projectId,
        originalAmount: '20000',
      });
      const currency = context.organization.baseCurrency;
        await createApBill(context, {
          vendorId: vendor.id,
          projectId,
          currency,
          totalAmount: '10000',
          billDate: '2026-08-01',
          subcontractAgreementId: agreementA.id,
        lines: classifyApBillLines(
          [
            {
              description: 'Valuation A',
              quantity: '1',
              unitAmount: '10000',
              lineTotal: '10000',
              currency,
            },
          ],
          costCategoryId,
        ),
      });
        await createApBill(context, {
          vendorId: vendor.id,
          projectId,
          currency,
          totalAmount: '3000',
          billDate: '2026-08-01',
          subcontractAgreementId: agreementB.id,
        lines: classifyApBillLines(
          [
            {
              description: 'Valuation B',
              quantity: '1',
              unitAmount: '3000',
              lineTotal: '3000',
              currency,
            },
          ],
          costCategoryId,
        ),
      });

      const forA = await getVendorApOutstanding(context, vendor.id, {
        subcontractAgreementId: agreementA.id,
      });
      const forB = await getVendorApOutstanding(context, vendor.id, {
        subcontractAgreementId: agreementB.id,
      });
      const listed = await listVendorSubcontracts(context, vendor.id);
      return { forA, forB, listed, agreementAId: agreementA.id, agreementBId: agreementB.id };
    });

    expect(result.forA.bills).toHaveLength(1);
    expect(result.forB.bills).toHaveLength(1);
    expect(result.forA.bills[0]?.subcontractAgreementId).toBe(result.agreementAId);
    expect(result.forB.bills[0]?.subcontractAgreementId).toBe(result.agreementBId);
    expect(Number(result.forA.billed)).toBe(10000);
    expect(Number(result.forB.billed)).toBe(3000);

    const listA = result.listed.find((row) => row.id === result.agreementAId);
    const listB = result.listed.find((row) => row.id === result.agreementBId);
    expect(Number(listA?.billedAmount)).toBe(10000);
    expect(Number(listB?.billedAmount)).toBe(3000);
    expect(Number(listA?.outstandingAmount)).toBe(10000);
    expect(Number(listB?.outstandingAmount)).toBe(3000);
  });
});
