import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { demoSessions } from '@drizzle/schema';
import { DEMO_FIXTURE_KEYS, buildDemoFixture } from '@/modules/demo/fixtures/fixture-builder';
import { insertDemoOrganization, withDemoProvisioner } from '@/modules/demo/application/provision';
import { seedDemoFixture } from '@/modules/demo/application/seed-fixture';
import { deleteDemoSessionOrganization } from '@/modules/demo/application/delete-session';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { insertMembership } from '@/modules/tenancy';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { getHomeDashboard } from '@/modules/financials/application/get-home-dashboard';
import { getBusinessProfitability } from '@/modules/financials/application/get-business-profitability';
import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';

const ANCHOR = new Date('2026-11-16T10:00:00Z');

type ProfileEngineReport = {
  profileKey: OnboardingBusinessType;
  contracts: number;
  originalEvents: number;
  activeRollupRows: number;
  rowsWithPositiveCcv: number;
  rowsWithArtificialLoss: number;
  dashboardContractValue: string;
  dashboardActualCost: string;
  contractualProfit: string | null;
  purchaseOrders: number;
  committedOpen: number;
  subcontracts: number;
  budgets: number;
  tasksWithOwner: number;
};

describe('demo contract value engines — all 20 profiles', () => {
  let database: TestDatabase;
  const reports: ProfileEngineReport[] = [];

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 240_000);

  afterAll(async () => {
    await database.close();
  });

  async function seedProfile(profileKey: OnboardingBusinessType): Promise<{
    organizationId: string;
    ownerId: string;
  }> {
    const fixture = buildDemoFixture(profileKey, ANCHOR);
    const ownerId = randomUUID();
    const organizationId = await database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        await ensureProfile(tx, {
          id: ownerId,
          email: `${randomUUID()}@demo.pf.internal`,
          displayName: 'Demo Owner',
          localePreference: 'he-IL',
        });
        const templateId = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} · template`,
          demoKind: 'template',
          profileKey,
        });
        const organizationIdInner = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} · ccv`,
          demoKind: 'session',
          profileKey,
        });
        await seedDemoFixture(tx, organizationIdInner, fixture);
        const membership = await insertMembership(tx, {
          organizationId: organizationIdInner,
          userId: ownerId,
          status: 'active',
        });
        const ownerRole = await findRoleByKey(tx, organizationIdInner, 'owner');
        if (!ownerRole) throw new Error('owner role missing');
        await assignRole(tx, {
          organizationId: organizationIdInner,
          membershipId: membership.id,
          userId: ownerId,
          roleId: ownerRole.id,
        });
        await tx.insert(demoSessions).values({
          organizationId: organizationIdInner,
          templateOrganizationId: templateId,
          profileKey,
          browserTokenHash: `ccv-${organizationIdInner}`,
        });
        return organizationIdInner;
      }),
    );
    return { organizationId, ownerId };
  }

  it.each([...DEMO_FIXTURE_KEYS])(
    'profile %s: value events drive CCV and block artificial zero-value losses',
    async (profileKey) => {
      const fixture = buildDemoFixture(profileKey, ANCHOR);
      const { organizationId, ownerId } = await seedProfile(profileKey);

      const counts = await database.asService(async (db) => {
        const row = resultRows<{
          contracts: number;
          original_events: number;
          positive_contracts_without_event: number;
          purchase_orders: number;
          committed_open: number;
          subcontracts: number;
          budgets: number;
          tasks_with_owner: number;
          duplicate_original_events: number;
        }>(
          await db.execute(sql`
            select
              (select count(*)::int from contracts where organization_id = ${organizationId}::uuid) as contracts,
              (select count(*)::int
                 from contract_value_events
                where organization_id = ${organizationId}::uuid
                  and kind = 'original') as original_events,
              (select count(*)::int
                 from contracts c
                where c.organization_id = ${organizationId}::uuid
                  and c.original_value_amount::numeric > 0
                  and not exists (
                    select 1
                      from contract_value_events e
                     where e.contract_id = c.id
                       and e.kind = 'original'
                       and e.amount::numeric = c.original_value_amount::numeric
                  )) as positive_contracts_without_event,
              (select count(*)::int from purchase_orders where organization_id = ${organizationId}::uuid and status = 'issued') as purchase_orders,
              (select count(*)::int from committed_costs where organization_id = ${organizationId}::uuid and status = 'open') as committed_open,
              (select count(*)::int from subcontract_agreements where organization_id = ${organizationId}::uuid and status = 'active') as subcontracts,
              (select count(*)::int from project_budgets where organization_id = ${organizationId}::uuid and status = 'active') as budgets,
              (select count(*)::int from tasks where organization_id = ${organizationId}::uuid and owner_employee_id is not null) as tasks_with_owner,
              (select coalesce(max(cnt), 0)::int
                 from (
                   select contract_id, count(*) as cnt
                     from contract_value_events
                    where organization_id = ${organizationId}::uuid
                      and kind = 'original'
                    group by contract_id
                 ) d) as duplicate_original_events
          `),
        )[0]!;
        return row;
      });

      expect(counts.contracts).toBe(fixture.contracts.length);
      expect(counts.original_events).toBe(fixture.contracts.length);
      expect(counts.positive_contracts_without_event).toBe(0);
      expect(counts.duplicate_original_events).toBeLessThanOrEqual(1);
      expect(counts.purchase_orders).toBe(fixture.purchaseOrders.length);
      expect(counts.committed_open).toBe(fixture.purchaseOrders.length);
      expect(counts.subcontracts).toBe(fixture.subcontracts.length);
      expect(counts.budgets).toBe(fixture.budgets.length);
      expect(counts.tasks_with_owner).toBeGreaterThanOrEqual(20);

      const financial = await database.asUser(ownerId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerId,
          organizationId,
          locale: 'he-IL',
        });
        const [dashboard, profitability, rollup] = await Promise.all([
          getHomeDashboard(context),
          getBusinessProfitability(context),
          getOrganizationProjectRollup(context, { limit: 50, offset: 0 }),
        ]);
        return { dashboard, profitability, rollup };
      });

      const activeWithContract = fixture.projects.filter(
        (project) =>
          project.status === 'active' &&
          fixture.contracts.some((contract) => contract.projectKey === project.key && contract.status === 'active'),
      );
      expect(activeWithContract.length).toBeGreaterThanOrEqual(3);

      const rollupRows = financial.rollup.eligibleRows;
      const rowsWithPositiveCcv = rollupRows.filter(
        (row) => row.currentContract && Number(row.currentContract.amount) > 0,
      );
      expect(rowsWithPositiveCcv.length).toBeGreaterThanOrEqual(2);

      // Artificial loss = CCV 0 while actual cost > 0 (the Production bug).
      const artificialLossRows = rollupRows.filter((row) => {
        const ccv = Number(row.currentContract?.amount ?? 0);
        const cost = Number(row.actualCost?.amount ?? 0);
        const profit = Number(row.actualProfit?.amount ?? 0);
        if (!(cost > 0)) return false;
        if (ccv > 0) return false;
        return Math.abs(profit + cost) < 0.02;
      });
      expect(artificialLossRows).toHaveLength(0);

      const dashboardCcv = Number(financial.dashboard.totalContractValue?.amount ?? 0);
      expect(dashboardCcv).toBeGreaterThan(0);

      const contractualProfit =
        financial.profitability?.contractualCurrentProfit.value?.amount ?? null;

      reports.push({
        profileKey,
        contracts: counts.contracts,
        originalEvents: counts.original_events,
        activeRollupRows: rollupRows.length,
        rowsWithPositiveCcv: rowsWithPositiveCcv.length,
        rowsWithArtificialLoss: artificialLossRows.length,
        dashboardContractValue: financial.dashboard.totalContractValue?.amount ?? '0',
        dashboardActualCost: financial.dashboard.totalActualCost?.amount ?? '0',
        contractualProfit,
        purchaseOrders: counts.purchase_orders,
        committedOpen: counts.committed_open,
        subcontracts: counts.subcontracts,
        budgets: counts.budgets,
        tasksWithOwner: counts.tasks_with_owner,
      });

      // Session teardown leaves no org residue.
      await database.asService(async (db) => {
        await withDemoProvisioner(db, async (tx) => {
          const deleted = await deleteDemoSessionOrganization(tx, organizationId);
          expect(deleted).toBe(1);
        });
        const leftover = resultRows<{ n: number }>(
          await db.execute(sql`
            select count(*)::int as n from organizations where id = ${organizationId}::uuid
          `),
        )[0]!;
        expect(leftover.n).toBe(0);
      });
    },
    180_000,
  );

  it('prints engine summary for all profiles', () => {
    expect(reports).toHaveLength(20);
    for (const row of reports) {
      expect(row.originalEvents).toBe(row.contracts);
      expect(row.rowsWithPositiveCcv).toBeGreaterThanOrEqual(2);
      expect(row.rowsWithArtificialLoss).toBe(0);
      expect(Number(row.dashboardContractValue)).toBeGreaterThan(0);
    }
    // Discoverable in CI logs.
    console.info(JSON.stringify({ demoContractValueEngineReports: reports }, null, 2));
  });
});
