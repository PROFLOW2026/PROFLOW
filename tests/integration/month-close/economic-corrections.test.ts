import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizationMemberships } from '@drizzle/schema';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import { loadMonthCloseEconomicForProject } from '@/modules/financials/data/month-close-economic.repository';
import {
  closeMonthClosePeriod,
  createMonthCloseAdjustment,
  ensureMonthClosePeriod,
  markMonthCloseReady,
} from '@/modules/month-close';
import { createProject } from '@/modules/projects';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { AuthorizationError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

async function provisionTenant(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) =>
    createOrganization(db, owner.id, { name, countryCode: 'IL' }),
  );
}

describe('month-close economic corrections', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let projectId: string;
  let periodId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);

    owner = await createTestUser(database, 'month-close-owner@example.test');
    const org = await provisionTenant(database, owner, 'Month Close Org');
    orgId = org.organization.id;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const created = await createProject(context, { name: 'Closed-month site' });
      projectId = created.projectId;

      const period = await ensureMonthClosePeriod(context, { yearMonth: '2026-01' });
      await markMonthCloseReady(context, { periodId: period.id });
      const closed = await closeMonthClosePeriod(context, { periodId: period.id });
      expect(closed.status).toBe('closed');
      periodId = closed.id;
    });
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  it('keeps audit-only rows money-null and folds a supersede net once in compose', async () => {
    const result = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });

      const audit = await createMonthCloseAdjustment(context, {
        periodId,
        reason: 'Documented missing allocation - no money',
      });

      const original = await createMonthCloseAdjustment(context, {
        periodId,
        adjustmentType: 'correction',
        reason: 'Missed vendor cost',
        amount: '100',
        currency: 'ILS',
        effectSide: 'cost',
        projectId,
      });

      const replacement = await createMonthCloseAdjustment(context, {
        periodId,
        adjustmentType: 'supersede',
        reason: 'Corrected vendor cost',
        amount: '40',
        currency: 'ILS',
        effectSide: 'cost',
        projectId,
        supersedesAdjustmentId: original.id,
      });

      const revenue = await createMonthCloseAdjustment(context, {
        periodId,
        adjustmentType: 'adjustment',
        reason: 'Late invoice recognition',
        amount: '25',
        currency: 'ILS',
        effectSide: 'revenue',
        projectId,
      });

      const nets = await loadMonthCloseEconomicForProject(tx, orgId, projectId, 'ILS');
      const composed = composeProjectFinancials({
        projectId,
        currency: 'ILS',
        expectedRemainingCostAmount: null,
        canReadCommercial: false,
        canReadBilling: true,
        canReadProfit: false,
        commercialData: null,
        billingRows: { currency: 'ILS', records: [] },
        expenseContributions: [
          {
            amount: '200.00',
            currency: 'ILS',
            costFamily: 'direct_project',
            isDirectOnProject: true,
            isAllocated: false,
            isSubcontractor: false,
            projectId,
            expenseId: 'seed-expense',
          },
        ],
        laborInput: null,
        committed: null,
        openAp: null,
        recognizedVendor: null,
        monthCloseEconomic: nets,
      });

      return { audit, original, replacement, revenue, nets, composed };
    });

    expect(result.audit.amount).toBeNull();
    expect(result.audit.currency).toBeNull();
    expect(result.audit.effectSide).toBeNull();
    expect(result.original.amount).toBe('100.000000');
    expect(result.replacement.supersedesAdjustmentId).toBe(result.original.id);
    expect(result.revenue.effectSide).toBe('revenue');

    // Loader drops the superseded 100; compose adds surviving 40 once.
    expect(result.nets.costNet.amount).toBe('40.000000');
    expect(result.nets.revenueNet.amount).toBe('25.000000');
    expect(result.composed.cost.actualCostToDate.amount).toBe('240.000000');
    expect(result.composed.billing.invoiced.amount).toBe('25.000000');
    expect(result.composed.billing.outstanding.amount).toBe('25.000000');
  });

  it('rejects a second supersede of an already-replaced row and a foreign project', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });

      const first = await createMonthCloseAdjustment(context, {
        periodId,
        reason: 'First economic',
        amount: '10',
        currency: 'ILS',
        effectSide: 'cost',
        projectId,
      });
      await createMonthCloseAdjustment(context, {
        periodId,
        adjustmentType: 'supersede',
        reason: 'Replace first',
        amount: '12',
        currency: 'ILS',
        effectSide: 'cost',
        projectId,
        supersedesAdjustmentId: first.id,
      });

      await expect(
        createMonthCloseAdjustment(context, {
          periodId,
          adjustmentType: 'supersede',
          reason: 'Second replace of same row',
          amount: '13',
          currency: 'ILS',
          effectSide: 'cost',
          projectId,
          supersedesAdjustmentId: first.id,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        createMonthCloseAdjustment(context, {
          periodId,
          reason: 'Other tenant project',
          amount: '5',
          currency: 'ILS',
          effectSide: 'cost',
          projectId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      const sameOrgOther = await createProject(context, { name: 'Other closed-month site' });
      const live = await createMonthCloseAdjustment(context, {
        periodId,
        reason: 'Live economic',
        amount: '8',
        currency: 'ILS',
        effectSide: 'cost',
        projectId,
      });
      await expect(
        createMonthCloseAdjustment(context, {
          periodId,
          adjustmentType: 'supersede',
          reason: 'Move to another project',
          amount: '8',
          currency: 'ILS',
          effectSide: 'cost',
          projectId: sameOrgOther.projectId,
          supersedesAdjustmentId: live.id,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        createMonthCloseAdjustment(context, {
          periodId,
          adjustmentType: 'supersede',
          reason: 'Flip to revenue',
          amount: '8',
          currency: 'ILS',
          effectSide: 'revenue',
          projectId,
          supersedesAdjustmentId: live.id,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('refuses create without month_close.manage', async () => {
    const manager = await createTestUser(database, 'month-close-manager@example.test');

    await database.asService(async (db) => {
      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId: manager.id,
        status: 'active',
      });
      const managerRole = await findRoleByKey(db, orgId, 'manager');
      if (!managerRole) throw new Error('Manager role missing');
      await assignRole(db, {
        organizationId: orgId,
        membershipId,
        userId: manager.id,
        roleId: managerRole.id,
      });
    });

    await database.asUser(manager.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: manager.id,
        organizationId: orgId,
        locale: 'en',
      });
      await expect(
        createMonthCloseAdjustment(context, {
          periodId,
          reason: 'Manager cannot post',
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
