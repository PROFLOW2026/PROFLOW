import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addPlanLine,
  allocateFinalSlice,
  applyBillingPlanTemplate,
  approveBillingCycle,
  assertWithinLineCap,
  createBillingCycle,
  createBillingPlan,
  findProfessionStarterTemplate,
  getBillingCycleDetail,
  getBillingPlanDetail,
  issueBillingCycle,
  releasePlanRetention,
  updateCycleLines,
  updatePlanLine,
} from '@/modules/billing-plan';
import { listLinesForPlan } from '@/modules/billing-plan/data/lines.repository';
import { getBillingRecord, listPaymentApplications } from '@/modules/billing';
import {
  createAdditionalContract,
  createProject,
  getProjectDetail,
} from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { money, percentOfMoney, toNumericString } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

describe('billing plan flow', () => {
  let database: TestDatabase;
  let organizationId: string;
  let userId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    const { orgA, userA } = await provisionTwoTenants(database);
    organizationId = orgA.organization.id;
    userId = userA.id;
  });

  it('covers create → partial cycles → overbill → issue → retention → future line edit', async () => {
    const seeded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'Billing plan site',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      const detail = await getProjectDetail(context, projectId);
      const contractId = detail.contract!.id;
      const currency = 'ILS';
      const base = money('100000', currency);

      const plan = await createBillingPlan(context, {
        projectId,
        contractId,
        name: '30/40/30 plan',
        activate: true,
        defaultRetentionPercent: '5',
      });

      const line1 = await addPlanLine(context, {
        planId: plan.id,
        label: 'Stage A',
        lineKind: 'percent_of_contract',
        agreedPercent: '30',
        agreedAmount: toNumericString(percentOfMoney(base, '30')),
        sortOrder: 0,
      });
      await addPlanLine(context, {
        planId: plan.id,
        label: 'Stage B',
        lineKind: 'percent_of_contract',
        agreedPercent: '40',
        agreedAmount: toNumericString(percentOfMoney(base, '40')),
        sortOrder: 1,
      });
      await addPlanLine(context, {
        planId: plan.id,
        label: 'Stage C',
        lineKind: 'percent_of_contract',
        agreedPercent: '30',
        agreedAmount: toNumericString(percentOfMoney(base, '30')),
        sortOrder: 2,
      });

      return { projectId, contractId, planId: plan.id, line1Id: line1.id };
    });

    // Cycle 1: enter 10% on first line
    const cycle1Id = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const cycle = await createBillingCycle(context, {
        planId: seeded.planId,
        title: 'Account 1',
        accountDate: '2026-08-01',
      });
      await updateCycleLines(context, {
        cycleId: cycle.id,
        lines: [{ planLineId: seeded.line1Id, currentPercent: '10' }],
      });
      return cycle.id;
    });

    let cycleDetail = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingCycleDetail(context, { cycleId: cycle1Id });
    });
    const line1c1 = cycleDetail.lines.find((l) => l.planLineId === seeded.line1Id)!;
    expect(line1c1.currentAmount).toBe('3000.000000');
    expect(Number(line1c1.currentPercent)).toBeCloseTo(10, 5);
    // Cumulative stays at prior until approval.
    expect(line1c1.cumulativeAmount).toBe('0.000000');

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      await issueBillingCycle(context, { cycleId: cycle1Id, finalize: true });
      await approveBillingCycle(context, { cycleId: cycle1Id, approveAllRequested: true });
    });

    // Cycle 2: 15% more on first line
    const cycle2Id = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const cycle = await createBillingCycle(context, {
        planId: seeded.planId,
        title: 'Account 2',
        accountDate: '2026-08-15',
      });
      await updateCycleLines(context, {
        cycleId: cycle.id,
        lines: [{ planLineId: seeded.line1Id, currentPercent: '15' }],
      });
      await issueBillingCycle(context, { cycleId: cycle.id, finalize: true });
      await approveBillingCycle(context, { cycleId: cycle.id, approveAllRequested: true });
      return cycle.id;
    });

    // Cycle 3: 20% more → cumulative 45% of line (still under 100%)
    const cycle3Id = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const cycle = await createBillingCycle(context, {
        planId: seeded.planId,
        title: 'Account 3',
        accountDate: '2026-09-01',
      });
      await updateCycleLines(context, {
        cycleId: cycle.id,
        lines: [{ planLineId: seeded.line1Id, currentPercent: '20' }],
      });
      return cycle.id;
    });

    cycleDetail = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingCycleDetail(context, { cycleId: cycle3Id });
    });
    const line1c3 = cycleDetail.lines.find((l) => l.planLineId === seeded.line1Id)!;
    expect(line1c3.priorAmount).toBe('7500.000000'); // approved 10% + 15% of 30000
    expect(line1c3.currentAmount).toBe('6000.000000');
    // Draft cumulative stays at prior until this cycle is approved.
    expect(line1c3.cumulativeAmount).toBe('7500.000000');

    // Overbill blocked: requesting more than remaining clamps current to remaining.
    const overAttempt = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return updateCycleLines(context, {
        cycleId: cycle3Id,
        lines: [{ planLineId: seeded.line1Id, currentPercent: '80' }],
      });
    });
    const capped = overAttempt.lines.find((l) => l.planLineId === seeded.line1Id)!;
    expect(capped.currentAmount).toBe('22500.000000');
    expect(capped.priorAmount).toBe('7500.000000');
    expect(capped.cumulativeAmount).toBe('7500.000000');
    expect(capped.remainingAmount).toBe('22500.000000');

    // Restore a non-closing 20% slice for the issue path below.
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      await updateCycleLines(context, {
        cycleId: cycle3Id,
        lines: [{ planLineId: seeded.line1Id, currentPercent: '20' }],
      });
    });

    // Domain-level overbill guard still rejects uncapped math.
    expect(() =>
      assertWithinLineCap(money('30000', 'ILS'), money('7500', 'ILS'), money('24000', 'ILS')),
    ).toThrow(DomainRuleError);

    // Submit + approve cycle 3 — creates/syncs AR without payment
    const issued = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      await issueBillingCycle(context, {
        cycleId: cycle3Id,
        finalize: true,
      });
      await approveBillingCycle(context, { cycleId: cycle3Id, approveAllRequested: true });
      const cycle = await getBillingCycleDetail(context, { cycleId: cycle3Id });
      const billing = await getBillingRecord(context, cycle.cycle.billingRecordId!);
      const payments = await listPaymentApplications(context, {
        projectId: seeded.projectId,
        limit: 20,
      });
      return { billing, payments, cycle: cycle.cycle, lines: cycle.lines };
    });

    expect(issued.cycle.billingRecordId).toBe(issued.billing.id);
    expect(issued.cycle.status).toBe('approved');
    expect(issued.billing.status).toBe('finalized');
    expect(issued.billing.totalAmount.amount).toBe('6000.000000');
    expect(issued.payments).toHaveLength(0);
    const approvedLine = issued.lines.find((l) => l.planLineId === seeded.line1Id)!;
    expect(approvedLine.approvedAmount).toBe('6000.000000');
    expect(approvedLine.cumulativeAmount).toBe('13500.000000');

    // Retention accumulates across approved cycles (5% of each approved current)
    const planDetail = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingPlanDetail(context, { planId: seeded.planId });
    });
    // 5% of (3000 + 4500 + 6000) = 675
    expect(planDetail.retentionAccumulated).toBe('675.000000');

    // Snapshot prior cycle line amounts before editing future line
    const priorCycleSnapshot = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingCycleDetail(context, { cycleId: cycle1Id });
    });
    const priorLine = priorCycleSnapshot.lines.find((l) => l.planLineId === seeded.line1Id)!;
    expect(priorLine.currentAmount).toBe('3000.000000');
    expect(priorLine.approvedAmount).toBe('3000.000000');
    expect(priorLine.cumulativeAmount).toBe('3000.000000');

    // Edit future (unbilled) line amount after partial bill — prior cycle unchanged
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const lines = planDetail.lines.filter((l) => l.id !== seeded.line1Id);
      const futureLine = lines[0]!;
      await updatePlanLine(context, {
        planId: seeded.planId,
        lineId: futureLine.id,
        agreedAmount: '45000',
      });
    });

    const priorAfterEdit = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingCycleDetail(context, { cycleId: cycle1Id });
    });
    const priorLineAfter = priorAfterEdit.lines.find((l) => l.planLineId === seeded.line1Id)!;
    expect(priorLineAfter.currentAmount).toBe(priorLine.currentAmount);
    expect(priorLineAfter.cumulativeAmount).toBe(priorLine.cumulativeAmount);
    expect(priorLineAfter.priorAmount).toBe(priorLine.priorAmount);

    // Silence unused — cycle2 issued for retention path
    expect(cycle2Id).toBeTruthy();
  });

  it('applies profession templates as independent plan line copies', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    organizationId = orgA.organization.id;
    userId = userA.id;

    const result = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'Template apply project',
        contractValueAmount: '200000',
        amountIncludesTax: false,
      });
      const detail = await getProjectDetail(context, projectId);
      const plan = await createBillingPlan(context, {
        projectId,
        contractId: detail.contract!.id,
        name: 'From electrical',
        activate: false,
      });
      const starter = findProfessionStarterTemplate('electrical')!;
      const applied = await applyBillingPlanTemplate(context, {
        planId: plan.id,
        professionTemplateKey: 'electrical',
        replaceExisting: true,
      });
      const lines = await listLinesForPlan(context.db, context.organizationId, plan.id);
      const templateBefore = structuredClone(
        findProfessionStarterTemplate('electrical')!.rows.map((r) => ({ ...r })),
      );
      await updatePlanLine(context, {
        planId: plan.id,
        lineId: lines[0]!.id,
        label: 'Mutated materials line',
        agreedAmount: '99999',
      });
      const templateAfter = findProfessionStarterTemplate('electrical')!.rows;
      return {
        starterCount: starter.rows.length,
        appliedCount: applied.lines.length,
        lineCount: lines.length,
        templateBefore,
        templateAfter,
      };
    });

    expect(result.appliedCount).toBe(result.starterCount);
    expect(result.lineCount).toBe(result.starterCount);
    expect(result.templateAfter).toEqual(result.templateBefore);
  });

  it('keeps two contracts / two plans isolated with no cross-mix', async () => {
    const result = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'Two-contract billing plans',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      const primary = (await getProjectDetail(context, projectId)).contract!;
      const secondary = await createAdditionalContract(context, {
        projectId,
        name: 'Facade package',
        enteredAmount: '40000',
        currency: 'ILS',
        amountIncludesTax: false,
      });

      const planA = await createBillingPlan(context, {
        projectId,
        contractId: primary.id,
        name: 'Primary plan',
        activate: true,
      });
      const planB = await createBillingPlan(context, {
        projectId,
        contractId: secondary.id,
        name: 'Secondary plan',
        activate: true,
      });

      const lineA = await addPlanLine(context, {
        planId: planA.id,
        label: 'Primary stage',
        lineKind: 'percent_of_contract',
        agreedPercent: '100',
        agreedAmount: '100000',
        sortOrder: 0,
      });
      const lineB = await addPlanLine(context, {
        planId: planB.id,
        label: 'Secondary stage',
        lineKind: 'percent_of_contract',
        agreedPercent: '100',
        agreedAmount: '40000',
        sortOrder: 0,
      });

      const cycleA = await createBillingCycle(context, {
        planId: planA.id,
        title: 'Primary account',
        accountDate: '2026-08-01',
      });
      await updateCycleLines(context, {
        cycleId: cycleA.id,
        lines: [{ planLineId: lineA.id, currentPercent: '10' }],
      });
      await issueBillingCycle(context, { cycleId: cycleA.id, finalize: true });
      await approveBillingCycle(context, {
        cycleId: cycleA.id,
        approveAllRequested: true,
      });

      const detailA = await getBillingPlanDetail(context, { planId: planA.id });
      const detailB = await getBillingPlanDetail(context, { planId: planB.id });
      return {
        planAContractId: planA.contractId,
        planBContractId: planB.contractId,
        lineAId: lineA.id,
        lineBId: lineB.id,
        billedA: detailA.reconciliation.billedTotal,
        billedB: detailB.reconciliation.billedTotal,
        linesA: detailA.lines.map((l) => l.id),
        linesB: detailB.lines.map((l) => l.id),
      };
    });

    expect(result.planAContractId).not.toBe(result.planBContractId);
    expect(result.linesA).toContain(result.lineAId);
    expect(result.linesA).not.toContain(result.lineBId);
    expect(result.linesB).toContain(result.lineBId);
    expect(result.linesB).not.toContain(result.lineAId);
    expect(result.billedA).toBe('10000.000000');
    expect(result.billedB).toBe('0.000000');
  });

  it('accumulates retention, supports partial then final release, and issue creates AR without payment', async () => {
    const seeded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'Retention release plan',
        contractValueAmount: '100000',
        amountIncludesTax: false,
      });
      const contractId = (await getProjectDetail(context, projectId)).contract!.id;
      const plan = await createBillingPlan(context, {
        projectId,
        contractId,
        name: 'Retention plan',
        activate: true,
        defaultRetentionPercent: '10',
      });
      const line = await addPlanLine(context, {
        planId: plan.id,
        label: 'Stage',
        lineKind: 'percent_of_contract',
        agreedPercent: '100',
        agreedAmount: '100000',
        sortOrder: 0,
      });
      return { projectId, planId: plan.id, lineId: line.id };
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      for (const [title, date, percent] of [
        ['A1', '2026-08-01', '20'],
        ['A2', '2026-08-15', '30'],
      ] as const) {
        const cycle = await createBillingCycle(context, {
          planId: seeded.planId,
          title,
          accountDate: date,
        });
        await updateCycleLines(context, {
          cycleId: cycle.id,
          lines: [{ planLineId: seeded.lineId, currentPercent: percent }],
        });
        await issueBillingCycle(context, {
          cycleId: cycle.id,
          finalize: true,
        });
        await approveBillingCycle(context, {
          cycleId: cycle.id,
          approveAllRequested: true,
        });
        const detail = await getBillingCycleDetail(context, { cycleId: cycle.id });
        const billing = await getBillingRecord(context, detail.cycle.billingRecordId!);
        const payments = await listPaymentApplications(context, {
          projectId: seeded.projectId,
          limit: 20,
        });
        expect(billing.status).toBe('finalized');
        expect(payments).toHaveLength(0);
      }
    });

    const afterIssue = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingPlanDetail(context, { planId: seeded.planId });
    });
    // 10% of (20000 + 30000) = 5000 accumulated / held
    expect(afterIssue.retentionAccumulated).toBe('5000.000000');
    expect(afterIssue.retentionHeldRemaining).toBe('5000.000000');

    const partial = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return releasePlanRetention(context, {
        planId: seeded.planId,
        amount: '2000',
        releasedOn: '2026-08-20',
      });
    });
    expect(partial.heldRemaining).toBe('3000.000000');

    await expect(
      database.asUser(userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId,
          organizationId,
          locale: 'en',
        });
        return releasePlanRetention(context, {
          planId: seeded.planId,
          amount: '999999',
          releasedOn: '2026-08-21',
        });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    const final = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return releasePlanRetention(context, {
        planId: seeded.planId,
        amount: '3000',
        releasedOn: '2026-08-22',
      });
    });
    expect(final.heldRemaining).toBe('0.000000');
  });

  it('closes 33.3333-style remainder exactly on final slice', () => {
    const base = money('100', 'ILS');
    const prior = money('66.670000', 'ILS');
    const slice = allocateFinalSlice({
      base,
      priorAmount: prior,
      requestedPercent: '33.3333',
    });
    expect(slice.closedExactly).toBe(true);
    expect(toNumericString(slice.cumulativeAmount)).toBe('100.000000');
    expect(toNumericString(slice.remainingAmount)).toBe('0.000000');
  });

  it('partial approval preserves unapproved; submitted edit allowed; cumulative uses approved', async () => {
    const seeded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'Partial approval site',
        contractValueAmount: '100000',
        amountIncludesTax: false,
      });
      const contractId = (await getProjectDetail(context, projectId)).contract!.id;
      const plan = await createBillingPlan(context, {
        projectId,
        contractId,
        name: 'Partial plan',
        activate: true,
        defaultRetentionPercent: '5',
      });
      const line = await addPlanLine(context, {
        planId: plan.id,
        label: 'Stage',
        lineKind: 'fixed_amount',
        agreedAmount: '100000',
        sortOrder: 0,
      });
      return { planId: plan.id, lineId: line.id };
    });

    const cycleId = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const cycle = await createBillingCycle(context, {
        planId: seeded.planId,
        title: 'Account',
        accountDate: '2026-08-01',
      });
      await updateCycleLines(context, {
        cycleId: cycle.id,
        lines: [{ planLineId: seeded.lineId, currentAmount: '100000' }],
      });
      // Submitted edit before approval still allowed.
      await issueBillingCycle(context, { cycleId: cycle.id, finalize: true });
      await updateCycleLines(context, {
        cycleId: cycle.id,
        lines: [{ planLineId: seeded.lineId, currentAmount: '100000' }],
      });
      await approveBillingCycle(context, {
        cycleId: cycle.id,
        lines: [{ planLineId: seeded.lineId, approvedAmount: '80000' }],
      });
      return cycle.id;
    });

    const detail = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingCycleDetail(context, { cycleId });
    });
    const line = detail.lines.find((l) => l.planLineId === seeded.lineId)!;
    expect(line.requestedAmount).toBe('100000.000000');
    expect(line.approvedAmount).toBe('80000.000000');
    expect(line.cumulativeAmount).toBe('80000.000000');
    expect(line.remainingAmount).toBe('20000.000000');
    expect(line.retentionAmount).toBe('4000.000000'); // 5% of 80k
    expect(detail.cycle.status).toBe('partially_approved');

    const billing = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, detail.cycle.billingRecordId!);
    });
    expect(billing.totalAmount.amount).toBe('80000.000000');
  });
});
