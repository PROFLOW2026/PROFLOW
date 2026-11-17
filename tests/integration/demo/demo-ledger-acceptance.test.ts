/**
 * Demo acceptance A1–A3, A5–A7, A10–A15 (engines + DB) for all 20 profiles.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { DEMO_FIXTURE_KEYS, buildDemoFixture } from '@/modules/demo/fixtures/fixture-builder';
import { getCycleParams } from '@/modules/demo/fixtures/cycle-params';
import { insertDemoOrganization, withDemoProvisioner } from '@/modules/demo/application/provision';
import { seedDemoFixture } from '@/modules/demo/application/seed-fixture';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { insertMembership } from '@/modules/tenancy';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { getHomeDashboard } from '@/modules/financials/application/get-home-dashboard';
import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { getOrganizationCashFlowForecast } from '@/modules/financials/application/get-organization-cash-flow-forecast';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { seedSystem } from '@tests/setup/fixtures';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';
const ANCHOR = new Date('2026-11-17T10:00:00Z');

describe('demo ledger acceptance A1–A15', () => {
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
          name: `${fixture.organizationName} · accept`,
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

  it.each([...DEMO_FIXTURE_KEYS])(
    'A1–A15 profile %s',
    async (profileKey) => {
      const cycle = getCycleParams(profileKey);
      const { fixture, ownerId, organizationId } = await seedProfile(profileKey);

      const quiet = new Set(fixture.quietMonths);
      const last6 = (() => {
        const end = fixture.anchorDay.slice(0, 7);
        const [ey, em] = end.split('-').map(Number);
        const out: string[] = [];
        let y = ey!;
        let m = em!;
        for (let i = 0; i < 6; i += 1) {
          out.unshift(`${y}-${String(m).padStart(2, '0')}`);
          m -= 1;
          if (m < 1) {
            m = 12;
            y -= 1;
          }
        }
        return out;
      })();

      // A7 / A14 / A15 fixture-level
      expect(fixture.tasks.some((t) => t.status === 'done')).toBe(true);
      expect(
        fixture.tasks.some(
          (t) => t.status !== 'done' && t.dueDate && t.dueDate < fixture.anchorDay,
        ),
      ).toBe(true);
      expect(fixture.tasks.every((t) => t.employeeKey && ['e1', 'e2', 'e3', 'e4'].includes(t.employeeKey))).toBe(
        true,
      );
      expect(fixture.milestones.filter((m) => m.projectKey === 'p-active').length).toBeGreaterThanOrEqual(2);
      expect(fixture.contracts.some((c) => c.projectKey === 'p-archive')).toBe(true);
      expect(fixture.archetypeId).toBe(cycle.archetypeId);
      expect(fixture.subcontracts.length).toBe(cycle.subcontractIntensity);

      // A2 payroll rows ≥4/6 per employee
      for (const emp of fixture.employees) {
        const paidMonths = new Set(
          fixture.payrollPayments
            .filter((p) => p.employeeKey === emp.key && last6.includes(p.yearMonth) && Number(p.paidAmount) > 0)
            .map((p) => p.yearMonth),
        );
        expect(paidMonths.size).toBeGreaterThanOrEqual(4);
      }

      // A11 fixture: each non-quiet activity month in last6 has expense paid or AP paid
      for (const ym of last6) {
        if (quiet.has(ym)) continue;
        const hasExpensePaid = fixture.expenses.some((e) => e.paidAt?.startsWith(ym));
        const hasApPaid = fixture.vendorBills.some((b) => b.paidDate?.startsWith(ym));
        const hasBillingOrPayment =
          fixture.billing.some((b) => b.issueDate.startsWith(ym)) ||
          fixture.payments.some((p) => p.paymentDate.startsWith(ym));
        expect(hasBillingOrPayment).toBe(true);
        expect(hasExpensePaid || hasApPaid).toBe(true);
      }

      const engine = await database.asUser(ownerId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerId,
          organizationId,
          locale: 'he-IL',
        });
        const [dashboard, rollup, forecast] = await Promise.all([
          getHomeDashboard(context),
          getOrganizationProjectRollup(context, { limit: 50, offset: 0 }),
          getOrganizationCashFlowForecast(context),
        ]);
        return { dashboard, rollup, forecast };
      });

      const months = engine.dashboard.monthlyLedger?.months ?? [];
      expect(months.length).toBeGreaterThanOrEqual(6);

      // A1 / A12
      for (const month of months) {
        if (quiet.has(month.yearMonth)) continue;
        const collected = Number(month.collected?.gross?.amount ?? 0);
        const expensesPaid = Number(month.expensesPaid?.gross?.amount ?? 0);
        const payrollPaid = Number(month.payrollPaid?.gross?.amount ?? 0);
        const cashOut = Number(month.cashOut?.gross?.amount ?? 0);
        const empty =
          collected === 0 && expensesPaid === 0 && payrollPaid === 0 && cashOut === 0;
        expect(empty).toBe(false);
        if (collected > 0) {
          expect(cashOut + payrollPaid).toBeGreaterThan(0);
        }
      }

      // A2 org payrollPaid ≥4 months
      const payrollMonths = months.filter((m) => Number(m.payrollPaid?.gross?.amount ?? 0) > 0);
      expect(payrollMonths.length).toBeGreaterThanOrEqual(4);

      // A3 F13 — payment amount is NET; ledger collected.gross ≈ net×1.18 for that month's payments
      const ymWithPay = fixture.payments[0]!.paymentDate.slice(0, 7);
      const netsInMonth = fixture.payments
        .filter((p) => p.paymentDate.startsWith(ymWithPay))
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const expectedGross = Math.round(netsInMonth * 1.18 * 100) / 100;
      const ledgerMonth = months.find((m) => m.yearMonth === ymWithPay);
      expect(ledgerMonth).toBeTruthy();
      expect(Number(ledgerMonth!.collected?.net?.amount ?? 0)).toBeCloseTo(netsInMonth, 1);
      expect(Number(ledgerMonth!.collected?.gross?.amount ?? 0)).toBeCloseTo(expectedGross, 0);

      // A5 rollup
      expect(engine.rollup.eligibleRows.length).toBeGreaterThanOrEqual(2);
      const withCcv = engine.rollup.eligibleRows.filter((r) => Number(r.currentContract?.amount ?? 0) > 0);
      const withCost = engine.rollup.eligibleRows.filter((r) => Number(r.actualCost?.amount ?? 0) > 0);
      expect(withCcv.length).toBeGreaterThanOrEqual(2);
      expect(withCost.length).toBeGreaterThan(0);
      expect(
        engine.rollup.eligibleRows.some((r) => {
          const ccv = Number(r.currentContract?.amount ?? 0);
          const cost = Number(r.actualCost?.amount ?? 0);
          return cost > 0 && ccv === 0;
        }),
      ).toBe(false);

      // A6: some month with payroll and time exists in fixture
      const timeMonths = new Set(fixture.timeEntries.map((t) => t.workDate.slice(0, 7)));
      const payMonths = new Set(fixture.payrollPayments.map((p) => p.yearMonth));
      expect([...timeMonths].some((m) => payMonths.has(m))).toBe(true);

      // A10 forecast — commitments / expected cash from org forecast loader
      expect(engine.forecast.items.length + fixture.purchaseOrders.length).toBeGreaterThan(0);

      // A13 attendance coverage last 6
      for (const ym of last6) {
        const days = fixture.attendanceDates.filter((d) => d.startsWith(ym));
        expect(days.length).toBeGreaterThanOrEqual(2);
        const times = fixture.timeEntries.filter((t) => t.workDate.startsWith(ym));
        expect(times.length).toBeGreaterThanOrEqual(1);
      }

      // A15 DB milestones / archive events
      const counts = await database.asService(async (db) =>
        resultRows<{ milestones: number; archive_events: number; payroll: number }>(
          await db.execute(sql`
            select
              (select count(*)::int from project_milestones where organization_id = ${organizationId}::uuid) as milestones,
              (select count(*)::int from contract_value_events cve
                join contracts c on c.id = cve.contract_id
                join projects p on p.id = c.project_id
                where c.organization_id = ${organizationId}::uuid and p.status = 'completed') as archive_events,
              (select count(*)::int from employee_payroll_payments where organization_id = ${organizationId}::uuid and payment_status = 'paid') as payroll
          `),
        )[0]!,
      );
      expect(counts.milestones).toBeGreaterThanOrEqual(4);
      expect(counts.archive_events).toBeGreaterThanOrEqual(1);
      expect(counts.payroll).toBeGreaterThanOrEqual(fixture.employees.length * 4);
    },
    180_000,
  );

  it('A4/A14 archetype diversity', () => {
    const fixtures = DEMO_FIXTURE_KEYS.map((key) => buildDemoFixture(key, ANCHOR));
    const byArch = new Map<string, typeof fixtures>();
    for (const f of fixtures) {
      const list = byArch.get(f.archetypeId) ?? [];
      list.push(f);
      byArch.set(f.archetypeId, list);
    }
    expect(byArch.size).toBe(6);
    const signatures = [...byArch.entries()].map(([id, list]) => {
      const sample = list[0]!;
      const cycle = getCycleParams(sample.profileKey);
      return {
        id,
        workforce: sample.employees.length,
        mix: cycle.serviceVsProjectMix,
        expenseDensity: cycle.expenseDensity,
        subcontract: sample.subcontracts.length,
        arLag: cycle.arLagDays,
        expenseLabels: sample.expenses[0]?.description ?? '',
        taskTitle: sample.tasks[0]?.title ?? '',
      };
    });
    // Every archetype differs from every other in ≥3 structural dims
    for (let i = 0; i < signatures.length; i += 1) {
      for (let j = i + 1; j < signatures.length; j += 1) {
        const a = signatures[i]!;
        const b = signatures[j]!;
        let diffs = 0;
        if (a.workforce !== b.workforce) diffs += 1;
        if (a.mix !== b.mix) diffs += 1;
        if (a.expenseDensity !== b.expenseDensity) diffs += 1;
        if (a.subcontract !== b.subcontract) diffs += 1;
        if (a.arLag !== b.arLag) diffs += 1;
        expect(diffs).toBeGreaterThanOrEqual(3);
      }
    }
    // Professional copy uniqueness across profiles
    const orgNames = new Set(fixtures.map((f) => f.organizationName));
    expect(orgNames.size).toBe(20);
    const task0 = new Set(fixtures.map((f) => f.tasks[0]!.title));
    expect(task0.size).toBeGreaterThanOrEqual(15);
  });
});
