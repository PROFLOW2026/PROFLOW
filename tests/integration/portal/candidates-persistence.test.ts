import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { externalAccessGrants, externalPrincipals, vendors } from '@drizzle/schema';
import {
  assertGrantSameOrgAndPrincipal,
  assertVendorSameOrg,
  drizzleVendorPortalCandidatesRepository,
  setPortalCandidatesPersistenceReadyForTests,
} from '@/modules/portal';
import { createOrganization } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

async function provision(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) => createOrganization(db, owner.id, { name, countryCode: 'IL' }));
}

describe('portal candidates persistence (L + cross-tenant)', () => {
  let database: TestDatabase;
  let userA: TestUser;
  let userB: TestUser;
  let orgAId: string;
  let orgBId: string;
  let vendorAId: string;
  let vendorBId: string;
  let grantAId: string;
  let principalAId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    userA = await createTestUser(database, 'portal-cand-a@example.test');
    userB = await createTestUser(database, 'portal-cand-b@example.test');
    const orgA = await provision(database, userA, 'Portal Org A');
    const orgB = await provision(database, userB, 'Portal Org B');
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;

    await database.asService(async (db) => {
      const [vendorA] = await db
        .insert(vendors)
        .values({
          organizationId: orgAId,
          name: 'Vendor A',
          status: 'active',
        })
        .returning({ id: vendors.id });
      vendorAId = vendorA!.id;

      const [vendorB] = await db
        .insert(vendors)
        .values({
          organizationId: orgBId,
          name: 'Vendor B',
          status: 'active',
        })
        .returning({ id: vendors.id });
      vendorBId = vendorB!.id;

      const [principal] = await db
        .insert(externalPrincipals)
        .values({
          email: 'vendor-principal@example.test',
          displayName: 'Vendor Principal',
        })
        .returning({ id: externalPrincipals.id });
      principalAId = principal!.id;

      const [grant] = await db
        .insert(externalAccessGrants)
        .values({
          organizationId: orgAId,
          principalId: principalAId,
          portalKind: 'vendor',
          vendorId: vendorAId,
          scopes: ['bill.candidate', 'documents.upload'],
          status: 'active',
        })
        .returning({ id: externalAccessGrants.id });
      grantAId = grant!.id;
    });
  });

  afterAll(async () => {
    setPortalCandidatesPersistenceReadyForTests(null);
    await database.close();
  });

  beforeEach(() => {
    setPortalCandidatesPersistenceReadyForTests(true);
  });

  it('L - persistence restart: AP + compliance candidates survive', async () => {
    const ap = await database.asService(async (db) =>
      drizzleVendorPortalCandidatesRepository.insertAp(db, {
        organizationId: orgAId,
        vendorId: vendorAId,
        grantId: grantAId,
        principalId: principalAId,
        currency: 'ILS',
        totalAmount: '10.000000',
        lines: [
          {
            description: 'Part',
            quantity: '1.000000',
            unitAmount: '10.000000',
            lineTotal: '10.000000',
          },
        ],
      }),
    );

    const compliance = await database.asService(async (db) =>
      drizzleVendorPortalCandidatesRepository.insertCompliance(db, {
        organizationId: orgAId,
        vendorId: vendorAId,
        grantId: grantAId,
        principalId: principalAId,
        artifactKind: 'insurance',
        name: 'Liability',
      }),
    );

    expect(ap.mutatesFinancialTruth).toBe(false);
    expect(compliance.mutatesFinancialTruth).toBe(false);

    const foundAp = await database.asService(async (db) =>
      drizzleVendorPortalCandidatesRepository.listApForVendor(db, orgAId, vendorAId),
    );
    const foundCompliance = await database.asService(async (db) =>
      drizzleVendorPortalCandidatesRepository.listComplianceForVendor(db, orgAId, vendorAId),
    );

    expect(foundAp.some((row) => row.id === ap.id)).toBe(true);
    expect(foundCompliance.some((row) => row.id === compliance.id)).toBe(true);
  });

  it('rejects cross-tenant vendor and grant', async () => {
    await database.asService(async (db) => {
      await expect(assertVendorSameOrg(db, orgAId, vendorBId)).rejects.toBeInstanceOf(
        DomainRuleError,
      );
      await assertVendorSameOrg(db, orgAId, vendorAId);

      await expect(
        assertGrantSameOrgAndPrincipal({
          db,
          organizationId: orgAId,
          grantId: grantAId,
          vendorId: vendorBId,
          principalId: principalAId,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        assertGrantSameOrgAndPrincipal({
          db,
          organizationId: orgBId,
          grantId: grantAId,
          vendorId: vendorAId,
          principalId: principalAId,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        assertGrantSameOrgAndPrincipal({
          db,
          organizationId: orgAId,
          grantId: grantAId,
          vendorId: vendorAId,
          principalId: '01900000-0000-7000-8000-00000000dead',
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });
});
