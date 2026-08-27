import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  apBillProjectAllocations,
  apBills,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  subcontractAgreements,
  subcontractValueEvents,
  vendors,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { setApBillProjectAllocationsReadyForTests } from '@/modules/ap';
import {
  loadRecognizedVendorBillsForProjects,
  sumOpenApPayableForProjects,
} from '@/modules/financials/data/committed-costs.repository';
import { sumSubcontractRemainingCommitmentForProjects } from '@/modules/financials/data/subcontract-commitment.repository';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';

/**
 * Proves financial batch helpers stay O(1) query groups as project count grows.
 * Result row volume may grow with N; Drizzle round-trips must not scale ~N.
 */
describe('financial batch query scale (N=1 vs N=30)', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let vendorId: string;
  let projectIds: string[];

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    setApBillProjectAllocationsReadyForTests(true);

    orgId = randomUUID();
    userId = randomUUID();
    vendorId = randomUUID();
    projectIds = Array.from({ length: 30 }, () => randomUUID());

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: 'batch-scale@example.test',
        displayName: 'Owner',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'Batch Scale Org',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });

      const roles = await provisionOrganizationRoles(db, orgId);
      await assignRole(db, {
        organizationId: orgId,
        membershipId,
        userId,
        roleId: roles.owner,
      });

      await db.insert(vendors).values({
        id: vendorId,
        organizationId: orgId,
        name: 'Scale Vendor',
        type: 'subcontractor',
      });

      await db.insert(projects).values(
        projectIds.map((id, index) => ({
          id,
          organizationId: orgId,
          name: `Project ${index + 1}`,
          status: 'active' as const,
          currency: 'ILS',
        })),
      );

      const materialsId = randomUUID();
      await db.execute(sql`
        INSERT INTO cost_categories (id, organization_id, key, name, family, is_system, sort_order)
        VALUES (${materialsId}::uuid, ${orgId}::uuid, 'materials', 'Materials', 'direct_project', true, 1)
      `);

      for (let i = 0; i < projectIds.length; i += 1) {
        const projectId = projectIds[i]!;
        const billId = randomUUID();
        const agreementId = randomUUID();

        await db.insert(apBills).values({
          id: billId,
          organizationId: orgId,
          vendorId,
          projectId,
          status: 'draft',
          currency: 'ILS',
          totalAmount: '1000.000000',
          netAmount: '1000.000000',
          taxAmount: '0',
          grossAmount: '1000.000000',
          taxBasis: 'legacy_undivided',
          billDate: '2026-06-01',
          retentionHeldRemaining: '0',
        });

        await db.execute(sql`
          INSERT INTO ap_bill_lines (
            organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
            net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id, sort_order
          ) VALUES (
            ${orgId}::uuid, ${billId}::uuid, 'Scale line', 1, 1000, 1000,
            1000, 0, 1000, 'ILS', 'classified', ${materialsId}::uuid, 0
          )
        `);

        await db.execute(sql`
          UPDATE ap_bills SET status = 'open' WHERE id = ${billId}::uuid
        `);

        await db.insert(apBillProjectAllocations).values({
          organizationId: orgId,
          apBillId: billId,
          targetType: 'project',
          projectId,
          method: 'manual_amount',
          amount: '1000.000000',
          currency: 'ILS',
          status: 'applied',
          appliedAt: new Date(),
          sortOrder: 0,
        });

        await db.insert(subcontractAgreements).values({
          id: agreementId,
          organizationId: orgId,
          vendorId,
          projectId,
          title: `Sub ${i + 1}`,
          status: 'active',
          currency: 'ILS',
          originalAmount: '5000.000000',
        });

        await db.insert(subcontractValueEvents).values({
          organizationId: orgId,
          subcontractId: agreementId,
          kind: 'original',
          amount: '5000.000000',
          currency: 'ILS',
          effectiveDate: '2026-01-01',
        });
      }
    });
  }, 120_000);

  afterEach(() => {
    setApBillProjectAllocationsReadyForTests(undefined);
  });

  it('AP open payable + recognized bills + subcontract commitment stay bounded', async () => {
    const sample1 = projectIds.slice(0, 1);
    const sample30 = projectIds;

    // Warm schema / plans once outside the counted window.
    await database.asUser(userId, async (tx) => {
      await sumOpenApPayableForProjects(tx, orgId, sample1, 'ILS');
      await loadRecognizedVendorBillsForProjects(tx, orgId, sample1, 'ILS');
      await sumSubcontractRemainingCommitmentForProjects(tx, orgId, sample1, 'ILS');
    });

    const n1 = await database.asUserCountingQueries(userId, async (tx) => {
      await sumOpenApPayableForProjects(tx, orgId, sample1, 'ILS');
      await loadRecognizedVendorBillsForProjects(tx, orgId, sample1, 'ILS');
      await sumSubcontractRemainingCommitmentForProjects(tx, orgId, sample1, 'ILS');
      return true;
    });

    const n30 = await database.asUserCountingQueries(userId, async (tx) => {
      await sumOpenApPayableForProjects(tx, orgId, sample30, 'ILS');
      await loadRecognizedVendorBillsForProjects(tx, orgId, sample30, 'ILS');
      await sumSubcontractRemainingCommitmentForProjects(tx, orgId, sample30, 'ILS');
      return true;
    });

    // Same set-based query groups: N=30 must not approach 30× N=1.
    expect(n30.queryCount).toBe(n1.queryCount);
    expect(n30.queryCount).toBeLessThan(sample30.length);
    // Absolute ceiling for three set-based helpers (+ RLS setup queries).
    expect(n30.queryCount).toBeLessThanOrEqual(40);

    // Truth: every project receives a rollup entry.
    await database.asUser(userId, async (tx) => {
      const recognized = await loadRecognizedVendorBillsForProjects(tx, orgId, sample30, 'ILS');
      const openAp = await sumOpenApPayableForProjects(tx, orgId, sample30, 'ILS');
      const sub = await sumSubcontractRemainingCommitmentForProjects(tx, orgId, sample30, 'ILS');
      expect(recognized.size).toBe(30);
      expect(openAp.size).toBe(30);
      expect(sub.size).toBe(30);
      for (const id of sample30) {
        expect(Number(recognized.get(id)!.total.amount)).toBeCloseTo(1000, 5);
        expect(Number(openAp.get(id)!.total.amount)).toBeCloseTo(1000, 5);
        expect(Number(sub.get(id)!.total.amount)).toBeCloseTo(5000, 5);
      }
    });
  }, 120_000);
});
