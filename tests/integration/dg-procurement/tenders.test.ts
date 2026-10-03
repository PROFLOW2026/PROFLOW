import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { contractorTenderOffers, subcontractAgreements } from '@drizzle/schema';
import {
  awardTenderToSubcontract,
  createTenderPackage,
  getTenderPackageDetail,
  inviteVendorToTender,
  listPortalTenders,
  submitContractorBid,
} from '@/modules/contractor-procurement';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { asExternal, asInternal, procurementScenario } from '@tests/setup/dg-fixtures-procurement';

describe('Track Q - contractor tenders', () => {
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

  it('isolates bidder B from A and awards a draft subcontract', async () => {
    const s = await procurementScenario(database);
    const created = await asInternal(database, s.owner.id, s.orgId, (context) =>
      createTenderPackage(context, {
        projectId: s.projectId,
        tradeKey: 'electrical',
        title: 'Electrical package',
      }),
    );
    await asInternal(database, s.owner.id, s.orgId, (context) =>
      inviteVendorToTender(context, {
        projectId: s.projectId,
        packageId: created.packageId,
        vendorId: s.contractorA.vendorId,
      }),
    );
    await asInternal(database, s.owner.id, s.orgId, (context) =>
      inviteVendorToTender(context, {
        projectId: s.projectId,
        packageId: created.packageId,
        vendorId: s.contractorB.vendorId,
      }),
    );

    const offerA = await asExternal(database, s.contractorA, s.orgId, (context) =>
      submitContractorBid(context, {
        organizationId: s.orgId,
        projectId: s.projectId,
        packageId: created.packageId,
        bidAmount: '250000.00',
        notes: 'Bid A',
      }),
    );
    await asExternal(database, s.contractorB, s.orgId, (context) =>
      submitContractorBid(context, {
        organizationId: s.orgId,
        projectId: s.projectId,
        packageId: created.packageId,
        bidAmount: '240000.00',
      }),
    );

    const portalB = await asExternal(database, s.contractorB, s.orgId, (context) =>
      listPortalTenders(context, { organizationId: s.orgId, projectId: s.projectId }),
    );
    expect(portalB.map((p) => p.id)).toEqual([created.packageId]);

    await expect(
      asExternal(database, s.contractorB, s.orgId, (context) =>
        submitContractorBid(context, {
          organizationId: s.orgId,
          projectId: s.projectId,
          packageId: created.packageId,
          bidAmount: '239000.00',
        }),
      ),
    ).rejects.toMatchObject({ code: 'domain_rule_violated' });

    const detail = await asInternal(database, s.owner.id, s.orgId, (context) =>
      getTenderPackageDetail(context, { projectId: s.projectId, packageId: created.packageId }),
    );
    expect(detail.offers).toHaveLength(2);
    expect(detail.financials).toHaveLength(2);

    const awarded = await asInternal(database, s.owner.id, s.orgId, (context) =>
      awardTenderToSubcontract(context, {
        projectId: s.projectId,
        packageId: created.packageId,
        offerId: offerA.offerId,
        title: 'Electrical subcontract',
      }),
    );

    const [agreement] = await database.asService((db) =>
      db
        .select({ status: subcontractAgreements.status, vendorId: subcontractAgreements.vendorId })
        .from(subcontractAgreements)
        .where(
          and(
            eq(subcontractAgreements.organizationId, s.orgId),
            eq(subcontractAgreements.id, awarded.agreementId),
          ),
        ),
    );
    expect(agreement?.status).toBe('draft');
    expect(agreement?.vendorId).toBe(s.contractorA.vendorId);

    await expect(
      database.asUser(s.contractorB.authUser.id, (tx) =>
        tx
          .select({ id: contractorTenderOffers.id })
          .from(contractorTenderOffers)
          .where(
            and(
              eq(contractorTenderOffers.organizationId, s.orgId),
              eq(contractorTenderOffers.vendorId, s.contractorA.vendorId),
            ),
          ),
      ),
    ).resolves.toEqual([]);
  });
});
