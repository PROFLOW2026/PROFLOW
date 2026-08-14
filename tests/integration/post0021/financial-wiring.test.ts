import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  apBillProjectAllocations,
  apBills,
  employeeMonthCosts,
  employees,
  laborAllocationRunLines,
  laborAllocationRuns,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  timeEntries,
  vendors,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import {
  resolveVendorBillProjectAmounts,
  setApBillProjectAllocationsReadyForTests,
} from '@/modules/ap';
import { loadRecognizedVendorBillsForProject } from '@/modules/financials/data/committed-costs.repository';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import { setEmployeeMonthCostsReadyForTests } from '@/modules/workforce/domain/monthly-cost-gates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';

describe('POST-0021 financial wiring (displacement + bill NET slices)', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let projectAId: string;
  let projectBId: string;
  let employeeId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    setEmployeeMonthCostsReadyForTests(true);
    setApBillProjectAllocationsReadyForTests(true);

    orgId = randomUUID();
    userId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();
    employeeId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: 'post0021@example.test',
        displayName: 'Owner',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'Post-0021 Org',
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

      await db.insert(projects).values([
        {
          id: projectAId,
          organizationId: orgId,
          name: 'Project A',
          status: 'active',
          currency: 'ILS',
        },
        {
          id: projectBId,
          organizationId: orgId,
          name: 'Project B',
          status: 'active',
          currency: 'ILS',
        },
      ]);

      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Worker',
        status: 'active',
      });
    });
  });

  afterEach(() => {
    setEmployeeMonthCostsReadyForTests(undefined);
    setApBillProjectAllocationsReadyForTests(undefined);
  });

  it('does not double-count time snapshots + applied monthly allocation for same employee-month', async () => {
    const monthId = randomUUID();
    const runId = randomUUID();

    await database.asService(async (db) => {
      // Time snapshots in June (would be 800 if counted alone).
      await db.insert(timeEntries).values({
        organizationId: orgId,
        employeeId,
        workDate: '2026-06-10',
        hours: '8',
        kind: 'project',
        projectId: projectAId,
        costAmount: '800.000000',
        costCurrency: 'ILS',
      });

      await db.insert(employeeMonthCosts).values({
        id: monthId,
        organizationId: orgId,
        employeeId,
        yearMonth: '2026-06',
        currency: 'ILS',
        estimatedAmount: '1000.000000',
        knownAmount: '1000.000000',
        knownQuality: 'estimated',
        recognitionSource: 'time_snapshot',
        status: 'draft',
      });

      await db.insert(laborAllocationRuns).values({
        id: runId,
        organizationId: orgId,
        employeeMonthCostId: monthId,
        method: 'fixed_amount',
        status: 'draft',
        currency: 'ILS',
        allocatedAmount: '700.000000',
        unallocatedAmount: '300.000000',
      });

      await db.insert(laborAllocationRunLines).values({
        organizationId: orgId,
        laborAllocationRunId: runId,
        projectId: projectAId,
        amount: '700.000000',
        currency: 'ILS',
        sortOrder: 0,
      });

      // Apply run → trigger flips recognition_source to monthly_allocated.
      await db
        .update(laborAllocationRuns)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(eq(laborAllocationRuns.id, runId));
    });

    const summary = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getProjectLaborCost(context, projectAId);
    });

    // Displacement: use allocation line (700), not 700+800.
    expect(Number(summary.laborCost.amount)).toBeCloseTo(700, 5);
    expect(Number(summary.laborCost.amount)).not.toBeCloseTo(1500, 5);
  });

  it('attributes bill NET across projects once via applied allocations (not 2x)', async () => {
    const billId = randomUUID();
    const vendorId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(vendors).values({
        id: vendorId,
        organizationId: orgId,
        name: 'Vendor Co',
      });

      await db.insert(apBills).values({
        id: billId,
        organizationId: orgId,
        vendorId,
        projectId: projectAId,
        status: 'open',
        currency: 'ILS',
        totalAmount: '1000.000000',
        netAmount: '1000.000000',
        taxAmount: '0',
        grossAmount: '1000.000000',
        taxBasis: 'legacy_undivided',
        billDate: '2026-06-01',
      });

      await db.insert(apBillProjectAllocations).values([
        {
          organizationId: orgId,
          apBillId: billId,
          targetType: 'project',
          projectId: projectAId,
          method: 'manual_amount',
          amount: '400.000000',
          currency: 'ILS',
          status: 'applied',
          appliedAt: new Date(),
          sortOrder: 0,
        },
        {
          organizationId: orgId,
          apBillId: billId,
          targetType: 'project',
          projectId: projectBId,
          method: 'manual_amount',
          amount: '600.000000',
          currency: 'ILS',
          status: 'applied',
          appliedAt: new Date(),
          sortOrder: 1,
        },
      ]);
    });

    const pure = resolveVendorBillProjectAmounts({
      projectId: projectAId,
      currency: 'ILS',
      headerBills: [
        { billId, projectId: projectAId, totalAmount: '1000.000000', currency: 'ILS' },
      ],
      allocationLines: [
        { billId, projectId: projectAId, amount: '400.000000', currency: 'ILS' },
        { billId, projectId: projectBId, amount: '600.000000', currency: 'ILS' },
      ],
      billIdsWithAllocations: new Set([billId]),
    });
    expect(pure.amounts).toEqual(['400.000000']);

    const [rollA, rollB] = await database.asUser(userId, async (tx) => {
      const a = await loadRecognizedVendorBillsForProject(tx, orgId, projectAId, 'ILS');
      const b = await loadRecognizedVendorBillsForProject(tx, orgId, projectBId, 'ILS');
      return [a, b] as const;
    });

    expect(Number(rollA.total.amount)).toBeCloseTo(400, 5);
    expect(Number(rollB.total.amount)).toBeCloseTo(600, 5);
    expect(Number(rollA.total.amount) + Number(rollB.total.amount)).toBeCloseTo(1000, 5);
  });
});
