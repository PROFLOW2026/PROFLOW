import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employees,
  laborAllocationRunLines,
  laborAllocationRuns,
  organizationMemberships,
  organizations,
  profiles,
  projects,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  applyMonthlyEmployerCostAllocation,
  correctMonthlyEmployerCostActual,
  returnMonthlyEmployerCostToEstimate,
  saveMonthlyEmployerCostDraft,
} from '@/modules/workforce';
import { deriveKnownEmployerCost } from '@/modules/workforce/domain/monthly-allocation';
import { setEmployeeMonthCostsReadyForTests } from '@/modules/workforce/domain/monthly-cost-gates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';

describe('employee actual monthly employer cost', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let employeeId: string;
  let projectAId: string;
  let projectBId: string;
  const yearMonth = '2026-03';

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    setEmployeeMonthCostsReadyForTests(true);

    orgId = randomUUID();
    userId = randomUUID();
    employeeId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: 'actual-cost@example.test',
        displayName: 'Owner',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'Actual Cost Org',
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
        { id: projectAId, organizationId: orgId, name: 'A', status: 'active', currency: 'ILS' },
        { id: projectBId, organizationId: orgId, name: 'B', status: 'active', currency: 'ILS' },
      ]);

      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Worker',
        status: 'active',
        compensationClass: 'standard',
      });
    });
  });

  it('uses estimate when actual is null', () => {
    const derived = deriveKnownEmployerCost({
      estimatedAmount: '12000',
      actualAmount: null,
      currency: 'ILS',
    });
    expect(derived.knownQuality).toBe('estimated');
    expect(derived.knownAmount.amount).toBe('12000.000000');
  });

  it('uses actual when entered and splits across projects', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await saveMonthlyEmployerCostDraft(context, {
        employeeId,
        yearMonth,
        estimatedAmount: '12000',
        actualAmount: '15000',
        method: 'percent',
        allocationLines: [
          { projectId: projectAId, percent: '60' },
          { projectId: projectBId, percent: '40' },
        ],
      });
      await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth });

      const [lineA] = await tx
        .select({ amount: laborAllocationRunLines.amount })
        .from(laborAllocationRunLines)
        .innerJoin(
          laborAllocationRuns,
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        )
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(laborAllocationRunLines.projectId, projectAId),
            eq(employeeMonthCosts.yearMonth, yearMonth),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        );
      const [lineB] = await tx
        .select({ amount: laborAllocationRunLines.amount })
        .from(laborAllocationRunLines)
        .innerJoin(
          laborAllocationRuns,
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        )
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(laborAllocationRunLines.projectId, projectBId),
            eq(employeeMonthCosts.yearMonth, yearMonth),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        );
      expect(lineA?.amount).toBe('9000.000000');
      expect(lineB?.amount).toBe('6000.000000');
    });
  });

  it('retro correction updates effective cost without double counting', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await saveMonthlyEmployerCostDraft(context, {
        employeeId,
        yearMonth,
        estimatedAmount: '12000',
        actualAmount: '14000',
        method: 'fixed_amount',
        allocationLines: [{ projectId: projectAId, amount: '14000' }],
      });
      await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth });

      await correctMonthlyEmployerCostActual(context, {
        employeeId,
        yearMonth,
        estimatedAmount: '12000',
        actualAmount: '14800',
      });

      const [lineA] = await tx
        .select({ amount: laborAllocationRunLines.amount })
        .from(laborAllocationRunLines)
        .innerJoin(
          laborAllocationRuns,
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        )
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(laborAllocationRunLines.projectId, projectAId),
            eq(employeeMonthCosts.yearMonth, yearMonth),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        )
        .orderBy(desc(laborAllocationRuns.appliedAt))
        .limit(1);
      expect(lineA?.amount).toBe('14800.000000');

      const monthRows = await tx
        .select({ knownAmount: employeeMonthCosts.knownAmount, status: employeeMonthCosts.status })
        .from(employeeMonthCosts)
        .where(eq(employeeMonthCosts.employeeId, employeeId));
      expect(monthRows.filter((row) => row.status === 'applied')).toHaveLength(1);
      expect(monthRows.find((row) => row.status === 'applied')?.knownAmount).toBe('14800.000000');
    });
  });

  it('corrects applied month actual while preserving estimate (8250 → 8205)', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await saveMonthlyEmployerCostDraft(context, {
        employeeId,
        yearMonth,
        estimatedAmount: '8250',
        actualAmount: null,
        method: 'hours',
        allocationLines: [
          { projectId: projectAId, hours: '168' },
          { projectId: projectBId, hours: '112' },
        ],
      });
      await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth });

      await correctMonthlyEmployerCostActual(context, {
        employeeId,
        yearMonth,
        estimatedAmount: '8250',
        actualAmount: '8205',
      });

      const [month] = await tx
        .select({
          estimatedAmount: employeeMonthCosts.estimatedAmount,
          actualAmount: employeeMonthCosts.actualAmount,
          knownAmount: employeeMonthCosts.knownAmount,
          status: employeeMonthCosts.status,
        })
        .from(employeeMonthCosts)
        .where(
          and(
            eq(employeeMonthCosts.employeeId, employeeId),
            eq(employeeMonthCosts.yearMonth, yearMonth),
            eq(employeeMonthCosts.status, 'applied'),
          ),
        );
      expect(month?.estimatedAmount).toBe('8250.000000');
      expect(month?.actualAmount).toBe('8205.000000');
      expect(month?.knownAmount).toBe('8205.000000');

      const appliedLines = await tx
        .select({ amount: laborAllocationRunLines.amount })
        .from(laborAllocationRunLines)
        .innerJoin(
          laborAllocationRuns,
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        )
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(employeeMonthCosts.employeeId, employeeId),
            eq(employeeMonthCosts.yearMonth, yearMonth),
            eq(employeeMonthCosts.status, 'applied'),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        );
      const total = appliedLines.reduce((sum, line) => sum + Number(line.amount), 0);
      expect(total).toBeCloseTo(8205, 2);
      expect(appliedLines).toHaveLength(2);

      const monthRows = await tx
        .select({ status: employeeMonthCosts.status })
        .from(employeeMonthCosts)
        .where(eq(employeeMonthCosts.employeeId, employeeId));
      expect(monthRows.filter((row) => row.status === 'applied')).toHaveLength(1);
    });
  });

  it('return to estimate restores estimated effective cost', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await saveMonthlyEmployerCostDraft(context, {
        employeeId,
        yearMonth,
        estimatedAmount: '12000',
        actualAmount: '11300',
        method: 'fixed_amount',
        allocationLines: [{ projectId: projectAId, amount: '11300' }],
      });
      await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth });
      await returnMonthlyEmployerCostToEstimate(context, { employeeId, yearMonth });

      const [lineA] = await tx
        .select({ amount: laborAllocationRunLines.amount })
        .from(laborAllocationRunLines)
        .innerJoin(
          laborAllocationRuns,
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        )
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(laborAllocationRunLines.projectId, projectAId),
            eq(employeeMonthCosts.yearMonth, yearMonth),
            eq(laborAllocationRuns.status, 'applied'),
            inArray(employeeMonthCosts.status, ['applied', 'closed']),
          ),
        )
        .orderBy(desc(laborAllocationRuns.appliedAt))
        .limit(1);
      expect(lineA?.amount).toBe('12000.000000');
    });
  });

  it('corrects owner_manager company_only applied month with zero project lines', async () => {
    const ownerId = randomUUID();
    const ownerMonth = '2026-01';

    await database.asService(async (db) => {
      await db.insert(employees).values({
        id: ownerId,
        organizationId: orgId,
        name: 'Owner Manager',
        status: 'active',
        compensationClass: 'owner_manager',
        defaultLaborAllocationIntent: 'company_only',
      });
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'he-IL',
      });

      await saveMonthlyEmployerCostDraft(context, {
        employeeId: ownerId,
        yearMonth: ownerMonth,
        estimatedAmount: '27000',
        actualAmount: null,
        method: 'fixed_amount',
        remainderAllocationIntent: 'company_only',
        allocationLines: [],
      });
      await applyMonthlyEmployerCostAllocation(context, { employeeId: ownerId, yearMonth: ownerMonth });

      await correctMonthlyEmployerCostActual(context, {
        employeeId: ownerId,
        yearMonth: ownerMonth,
        estimatedAmount: '27000',
        actualAmount: '26500',
      });

      const [month] = await tx
        .select({
          estimatedAmount: employeeMonthCosts.estimatedAmount,
          actualAmount: employeeMonthCosts.actualAmount,
          knownAmount: employeeMonthCosts.knownAmount,
          status: employeeMonthCosts.status,
        })
        .from(employeeMonthCosts)
        .where(
          and(
            eq(employeeMonthCosts.employeeId, ownerId),
            eq(employeeMonthCosts.yearMonth, ownerMonth),
            eq(employeeMonthCosts.status, 'applied'),
          ),
        );
      expect(month?.estimatedAmount).toBe('27000.000000');
      expect(month?.actualAmount).toBe('26500.000000');
      expect(month?.knownAmount).toBe('26500.000000');

      const [run] = await tx
        .select({
          allocatedAmount: laborAllocationRuns.allocatedAmount,
          unallocatedAmount: laborAllocationRuns.unallocatedAmount,
          companyOnlyAmount: laborAllocationRuns.companyOnlyAmount,
          status: laborAllocationRuns.status,
        })
        .from(laborAllocationRuns)
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(employeeMonthCosts.employeeId, ownerId),
            eq(employeeMonthCosts.yearMonth, ownerMonth),
            eq(employeeMonthCosts.status, 'applied'),
            eq(laborAllocationRuns.status, 'applied'),
          ),
        )
        .orderBy(desc(laborAllocationRuns.appliedAt))
        .limit(1);
      expect(run?.allocatedAmount).toBe('0.000000');
      expect(run?.unallocatedAmount).toBe('0.000000');
      expect(run?.companyOnlyAmount).toBe('26500.000000');

      const lineCount = await tx
        .select({ id: laborAllocationRunLines.id })
        .from(laborAllocationRunLines)
        .innerJoin(
          laborAllocationRuns,
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        )
        .innerJoin(
          employeeMonthCosts,
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        )
        .where(
          and(
            eq(employeeMonthCosts.employeeId, ownerId),
            eq(employeeMonthCosts.yearMonth, ownerMonth),
          ),
        );
      expect(lineCount).toHaveLength(0);
    });
  });
});
