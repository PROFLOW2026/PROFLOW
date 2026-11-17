import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { DEMO_FIXTURE_KEYS, buildDemoFixture } from '@/modules/demo/fixtures/fixture-builder';
import { insertDemoOrganization, withDemoProvisioner } from '@/modules/demo/application/provision';
import { seedDemoFixture } from '@/modules/demo/application/seed-fixture';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { insertMembership } from '@/modules/tenancy';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { getHomeDashboard } from '@/modules/financials/application/get-home-dashboard';
import { getBusinessProfitability } from '@/modules/financials/application/get-business-profitability';
import { getMonthCashFlow } from '@/modules/financials/application/get-month-cash-flow';
import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { businessDate } from '@/shared/dates';
import { zeroMoney } from '@/shared/money';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';

const ANCHOR = new Date('2026-11-16T10:00:00Z');

type SeedMetrics = {
  profileKey: OnboardingBusinessType;
  organizationId: string;
  seedMs: number;
  projects: number;
  tasks: number;
  expensesFinalized: number;
  billingFinalized: number;
  payments: number;
  apOpen: number;
  apPayments: number;
  apApplications: number;
  timeApproved: number;
  attendanceDays: number;
  clients: number;
  employees: number;
};

type FinancialSample = {
  profileKey: OnboardingBusinessType;
  dashboardHasRevenueSignal: boolean;
  dashboardHasCostSignal: boolean;
  projectRows: number;
  projectsWithNonZeroActual: number;
  cashIn: string | null;
  cashOut: string | null;
  contractualProfitPresent: boolean;
};

describe('demo rich seed — all 20 profiles', () => {
  let database: TestDatabase;
  const metrics: SeedMetrics[] = [];
  const financialSamples: FinancialSample[] = [];

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
    seedMs: number;
  }> {
    const fixture = buildDemoFixture(profileKey, ANCHOR);
    const ownerId = randomUUID();
    const started = performance.now();
    const organizationId = await database.asService((db) =>
      withDemoProvisioner(db, async (tx) => {
        await ensureProfile(tx, {
          id: ownerId,
          email: `${randomUUID()}@demo.pf.internal`,
          displayName: 'Demo Owner',
          localePreference: 'he-IL',
        });
        const organizationIdInner = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} · test`,
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
        return organizationIdInner;
      }),
    );
    return { organizationId, ownerId, seedMs: performance.now() - started };
  }

  it.each([...DEMO_FIXTURE_KEYS])(
    'seeds profile %s without DB errors and with recognized financial rows',
    async (profileKey) => {
      const { organizationId, ownerId, seedMs } = await seedProfile(profileKey);
      const counts = await database.asService(async (db) => {
        const row = resultRows<{
          projects: number;
          tasks: number;
          expenses_finalized: number;
          billing_finalized: number;
          payments: number;
          ap_open: number;
          ap_payments: number;
          ap_applications: number;
          time_approved: number;
          attendance_days: number;
          clients: number;
          employees: number;
        }>(
          await db.execute(sql`
            select
              (select count(*)::int from projects where organization_id = ${organizationId}::uuid) as projects,
              (select count(*)::int from tasks where organization_id = ${organizationId}::uuid) as tasks,
              (select count(*)::int from expenses where organization_id = ${organizationId}::uuid and status = 'finalized') as expenses_finalized,
              (select count(*)::int from billing_records where organization_id = ${organizationId}::uuid and status = 'finalized') as billing_finalized,
              (select count(*)::int from payments where organization_id = ${organizationId}::uuid and status = 'recorded') as payments,
              (select count(*)::int from ap_bills where organization_id = ${organizationId}::uuid and status = 'open') as ap_open,
              (select count(*)::int from ap_payments where organization_id = ${organizationId}::uuid and status = 'recorded') as ap_payments,
              (select count(*)::int from ap_payment_applications where organization_id = ${organizationId}::uuid) as ap_applications,
              (select count(*)::int from time_entries where organization_id = ${organizationId}::uuid and approval_status = 'approved') as time_approved,
              (select count(*)::int from attendance_days where organization_id = ${organizationId}::uuid) as attendance_days,
              (select count(*)::int from clients where organization_id = ${organizationId}::uuid) as clients,
              (select count(*)::int from employees where organization_id = ${organizationId}::uuid) as employees
          `),
        )[0]!;
        return row;
      });

      expect(counts.projects).toBeGreaterThanOrEqual(8);
      expect(counts.tasks).toBeGreaterThanOrEqual(20);
      expect(counts.expenses_finalized).toBeGreaterThanOrEqual(16);
      expect(counts.billing_finalized).toBeGreaterThanOrEqual(10);
      expect(counts.payments).toBeGreaterThanOrEqual(8);
      expect(counts.ap_open).toBeGreaterThanOrEqual(5);
      expect(counts.ap_payments).toBeGreaterThanOrEqual(2);
      expect(counts.ap_applications).toBeGreaterThanOrEqual(2);
      expect(counts.time_approved).toBeGreaterThanOrEqual(16);
      expect(counts.attendance_days).toBeGreaterThanOrEqual(12);
      expect(counts.clients).toBeGreaterThanOrEqual(5);
      expect(counts.employees).toBeGreaterThanOrEqual(6);
      expect(seedMs).toBeLessThan(45_000);

      const fixture = buildDemoFixture(profileKey, ANCHOR);
      expect(fixture.projects.some((row) => /ביצוע|ניהול|חוזה|עיצוב|תכנון|ליווי|נטיע|ניקיון|התקנ|שיפוץ|קריא|אחזק/i.test(row.name) || row.name.length > 8)).toBe(true);
      expect(fixture.organizationName).not.toMatch(/עזריאלי|שיבא|מלונות דן|בנק לאומי/);

      metrics.push({
        profileKey,
        organizationId,
        seedMs,
        projects: counts.projects,
        tasks: counts.tasks,
        expensesFinalized: counts.expenses_finalized,
        billingFinalized: counts.billing_finalized,
        payments: counts.payments,
        apOpen: counts.ap_open,
        apPayments: counts.ap_payments,
        apApplications: counts.ap_applications,
        timeApproved: counts.time_approved,
        attendanceDays: counts.attendance_days,
        clients: counts.clients,
        employees: counts.employees,
      });

      const sampleKeys: OnboardingBusinessType[] = [
        'GENERAL_CONTRACTOR',
        'ELECTRICAL',
        'ARCHITECT',
        'CLEANING',
        'REAL_ESTATE_DEVELOPMENT',
        'PROJECT_MANAGEMENT',
      ];
      if (!sampleKeys.includes(profileKey)) return;

      const financial = await database.asUser(ownerId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerId,
          organizationId,
          locale: 'he-IL',
        });
        const [dashboard, profitability, cashFlow, rollup] = await Promise.all([
          getHomeDashboard(context),
          getBusinessProfitability(context),
          getMonthCashFlow(context, {
            from: businessDate('2026-05-01'),
            to: businessDate('2026-11-30'),
            collectionsActual: zeroMoney('ILS'),
          }),
          getOrganizationProjectRollup(context, { limit: 50, offset: 0 }),
        ]);
        return { dashboard, profitability, cashFlow, rollup };
      });

      const projectsWithNonZeroActual = financial.rollup.eligibleRows.filter(
        (row) => row.actualCost && Number(row.actualCost.amount) > 0,
      ).length;
      const projectsWithPositiveCcv = financial.rollup.eligibleRows.filter(
        (row) => row.currentContract && Number(row.currentContract.amount) > 0,
      ).length;
      expect(financial.rollup.eligibleRows.length).toBeGreaterThanOrEqual(2);
      expect(projectsWithPositiveCcv).toBeGreaterThanOrEqual(2);
      expect(Number(financial.dashboard.totalContractValue?.amount ?? 0)).toBeGreaterThan(0);
      expect(projectsWithNonZeroActual).toBeGreaterThan(0);

      const artificialZeroValueLoss = financial.rollup.eligibleRows.some((row) => {
        const ccv = Number(row.currentContract?.amount ?? 0);
        const cost = Number(row.actualCost?.amount ?? 0);
        const profit = Number(row.actualProfit?.amount ?? 0);
        return cost > 0 && ccv === 0 && Math.abs(profit + cost) < 0.02;
      });
      expect(artificialZeroValueLoss).toBe(false);

      financialSamples.push({
        profileKey,
        dashboardHasRevenueSignal: Boolean(
          financial.dashboard.totalContractValue && Number(financial.dashboard.totalContractValue.amount) > 0,
        ),
        dashboardHasCostSignal: Boolean(
          financial.dashboard.totalActualCost && Number(financial.dashboard.totalActualCost.amount) > 0,
        ),
        projectRows: financial.rollup.eligibleRows.length,
        projectsWithNonZeroActual,
        cashIn: financial.dashboard.billing?.netPaid?.amount ?? null,
        cashOut: financial.cashFlow.paidActual.amount,
        contractualProfitPresent: Boolean(
          financial.profitability?.contractualCurrentProfit.value &&
            financial.profitability.contractualCurrentProfit.value.amount !== '0.000000',
        ),
      });
    },
    120_000,
  );

  it('reports seed timing summary for all profiles', () => {
    expect(metrics).toHaveLength(20);
    const maxMs = Math.max(...metrics.map((row) => row.seedMs));
    const avgMs = metrics.reduce((sum, row) => sum + row.seedMs, 0) / metrics.length;
    expect(avgMs).toBeLessThan(20_000);
    expect(maxMs).toBeLessThan(45_000);
    // Keep values discoverable in CI logs without failing on variance.
    expect(financialSamples.length).toBeGreaterThanOrEqual(5);
    console.info(
      JSON.stringify(
        {
          avgSeedMs: Math.round(avgMs),
          maxSeedMs: Math.round(maxMs),
          metrics,
          financialSamples,
        },
        null,
        2,
      ),
    );
  });
});
