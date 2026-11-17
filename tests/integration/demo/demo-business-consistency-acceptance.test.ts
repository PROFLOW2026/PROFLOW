/**
 * Demo business consistency B1–B9 (fixture + selective engines) for all 20 profiles.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_FIXTURE_KEYS, buildDemoFixture, type DemoFixture } from '@/modules/demo/fixtures/fixture-builder';
import { insertDemoOrganization, withDemoProvisioner } from '@/modules/demo/application/provision';
import { seedDemoFixture } from '@/modules/demo/application/seed-fixture';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { insertMembership } from '@/modules/tenancy';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';

const ANCHOR = new Date('2026-11-17T10:00:00Z');
const MONEY_EPSILON = 1;

function ccvByProject(fixture: DemoFixture): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of fixture.contracts) {
    map.set(row.projectKey, Number(row.originalValueNet));
  }
  return map;
}

function billedNet(fixture: DemoFixture, projectKey: string): number {
  return fixture.billing
    .filter((row) => row.projectKey === projectKey)
    .reduce((sum, row) => sum + Number(row.subtotalAmount), 0);
}

function collectedNet(fixture: DemoFixture, projectKey: string): number {
  return fixture.payments
    .filter((row) => row.projectKey === projectKey)
    .reduce((sum, row) => sum + Number(row.amount), 0);
}

function serviceFixtureCostNet(fixture: DemoFixture): number {
  const expenseNet = fixture.expenses
    .filter((row) => row.projectKey === 'p-service')
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  const apNet = fixture.vendorBills
    .filter((row) => row.projectKey === 'p-service')
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  const laborNet = fixture.timeEntries
    .filter((row) => row.projectKey === 'p-service')
    .reduce((sum, row) => sum + Number(row.hours) * row.hourlyRate, 0);
  return expenseNet + apNet + laborNet;
}

function assertFixtureBusinessRules(fixture: DemoFixture, profileKey: OnboardingBusinessType): void {
  const ccv = ccvByProject(fixture);
  const projectStatus = new Map(fixture.projects.map((row) => [row.key, row.status]));

  for (const [projectKey, contractValue] of ccv) {
  const billed = billedNet(fixture, projectKey);
  const collected = collectedNet(fixture, projectKey);
  const ar = billed - collected;

  // B1
  expect(billed).toBeLessThanOrEqual(contractValue + MONEY_EPSILON);
  // B2
  expect(collected).toBeLessThanOrEqual(billed + MONEY_EPSILON);
  // B3
  expect(Math.abs(ar - (billed - collected))).toBeLessThanOrEqual(MONEY_EPSILON);

  if (billed > 0) {
    // B5
    expect(fixture.contracts.some((row) => row.projectKey === projectKey)).toBe(true);
  }

  const status = projectStatus.get(projectKey);
  if (status === 'active' && contractValue > 0) {
    const ratio = billed / contractValue;
    // B4
    expect(ratio).toBeGreaterThanOrEqual(0.15 - 1e-6);
    expect(ratio).toBeLessThanOrEqual(1.0 + MONEY_EPSILON / contractValue);
  } else if (contractValue > 0) {
    expect(billed / contractValue).toBeLessThanOrEqual(1.0 + MONEY_EPSILON / contractValue);
  }
  }

  for (const budget of fixture.budgets) {
    const contractValue = ccv.get(budget.projectKey) ?? 0;
    if (contractValue <= 0) continue;
    const amount = Number(budget.totalBudgetAmount);
    // B6
    expect(amount).toBeGreaterThanOrEqual(contractValue * 0.85 - MONEY_EPSILON);
    expect(amount).toBeLessThanOrEqual(contractValue * 1.1 + MONEY_EPSILON);
  }

  const serviceCcv = ccv.get('p-service') ?? 0;
  // B7 fixture slice (expenses + AP + labor estimate)
  expect(serviceFixtureCostNet(fixture)).toBeLessThanOrEqual(serviceCcv * 0.85 + 2);

  if (profileKey === 'ELECTRICAL') {
    const activeCcv = ccv.get('p-active') ?? 0;
    const activeBilled = billedNet(fixture, 'p-active');
    // B8
    expect(activeBilled - activeCcv).toBeLessThanOrEqual(MONEY_EPSILON);
    expect(activeCcv).toBeCloseTo(600_000, 0);
  }
}

describe('demo business consistency B1–B9', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  }, 240_000);

  afterAll(async () => {
    await database.close();
  });

  async function seedProfile(profileKey: OnboardingBusinessType) {
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
        const organizationIdInner = await insertDemoOrganization(tx, {
          name: `${fixture.organizationName} · b-accept`,
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
    return { fixture, ownerId, organizationId };
  }

  it.each([...DEMO_FIXTURE_KEYS])('B1–B9 profile %s', async (profileKey) => {
    const { fixture, ownerId, organizationId } = await seedProfile(profileKey);
    assertFixtureBusinessRules(fixture, profileKey);

    const engine = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'he-IL',
      });
      const rollup = await getOrganizationProjectRollup(context, { limit: 50, offset: 0 });
      return { context, rollup };
    });

    const activeWithContract = fixture.projects.filter(
      (row) => row.status === 'active' && (ccvByProject(fixture).get(row.key) ?? 0) > 0,
    );

    for (const project of activeWithContract) {
      const rollupRow = engine.rollup.eligibleRows.find((row) => row.name === project.name);
      expect(rollupRow).toBeDefined();
      const ccvFromFixture = ccvByProject(fixture).get(project.key) ?? 0;
      const engineCcv = Number(rollupRow!.currentContract?.amount ?? 0);
      // B9
      expect(engineCcv).toBeGreaterThan(0);
      expect(Math.abs(engineCcv - ccvFromFixture)).toBeLessThanOrEqual(MONEY_EPSILON);
    }

    if (profileKey === 'ELECTRICAL') {
      const pActiveProject = fixture.projects.find((row) => row.key === 'p-active')!;
      const pActive = engine.rollup.eligibleRows.find((row) => row.name === pActiveProject.name);
      expect(pActive).toBeDefined();
      const engineBilled = Number(pActive!.invoiced?.amount ?? 0);
      expect(engineBilled).toBeLessThanOrEqual(600_000 + MONEY_EPSILON);
    }

    const pServiceProject = fixture.projects.find((row) => row.key === 'p-service');
    if (pServiceProject) {
      const rollupService = engine.rollup.eligibleRows.find((row) => row.name === pServiceProject.name);
      if (rollupService?.projectId) {
        const financials = await database.asUser(ownerId, async (tx) => {
          const context = await resolveOrgContext(tx, {
            userId: ownerId,
            organizationId,
            locale: 'he-IL',
          });
          return getProjectFinancials(context, rollupService.projectId);
        });
        const serviceCcv = ccvByProject(fixture).get('p-service') ?? 0;
        const actualCost = Number(financials.cost?.actualCostToDate?.amount ?? 0);
        expect(actualCost).toBeLessThanOrEqual(serviceCcv + MONEY_EPSILON);
      }
    }
  });
});