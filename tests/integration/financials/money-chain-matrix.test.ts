import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  auditEvents,
  employeeMonthCosts,
  employees,
  laborAllocationRunLines,
  laborAllocationRuns,
} from '@drizzle/schema';
import {
  acceptApMatch,
  applyVendorCredit,
  createApBill,
  createVendorCredit,
  postVendorCredit,
  proposeApMatch,
} from '@/modules/ap';
import { createExpense } from '@/modules/expenses/application/create-expense';
import {
  confirmExpensePaid,
  voidExpensePaymentConfirmation,
} from '@/modules/expenses/application/expense-payments';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { getMonthCashFlow } from '@/modules/financials/application/get-month-cash-flow';
import { loadFinancialYearBookData } from '@/modules/financials/application/load-financial-year-book-data';
import {
  listOrganizationRecognizedCostBreakdownInDateRange,
  sumOrganizationRecognizedCostPairInDateRange,
} from '@/modules/financials/data/expenses.repository';
import { zeroMoney } from '@/shared/money';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createVendor } from '@/modules/vendors';
import { businessDate } from '@/shared/dates';
import { classifyApBillLines, findCostCategoryId } from '@tests/setup/cost-category-fixtures';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  applyGateAFinancialIntegrationMigrations,
  createProjectWithDefaultPackage,
} from '@tests/setup/financial-integration-pglite';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

const ILS = 'ILS';

/** Gate A PGlite matrix rows 6, 9–12, 14 deferred (contractor UI, month-close UX, billing E2E, PO, F12 overlap). */
type EmcSeedOptions = {
  readonly recognitionSource?: 'time_snapshot' | 'monthly_allocated';
  /** When set, only this NET amount is allocated to the project line (remainder unallocated). */
  readonly projectAllocatedAmount?: string;
};

async function seedAppliedEmployeeMonthCost(
  database: TestDatabase,
  input: {
    organizationId: string;
    employeeId: string;
    yearMonth: string;
    knownAmount: string;
    projectId: string;
  },
  options?: EmcSeedOptions,
) {
  const monthId = randomUUID();
  const runId = randomUUID();
  const recognitionSource = options?.recognitionSource ?? 'time_snapshot';
  const allocated =
    options?.projectAllocatedAmount ?? input.knownAmount;
  const unallocated = (
    Number(input.knownAmount) - Number(allocated)
  ).toFixed(6);

  await database.asService(async (db) => {
    await db.insert(employeeMonthCosts).values({
      id: monthId,
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      yearMonth: input.yearMonth,
      currency: ILS,
      estimatedAmount: input.knownAmount,
      knownAmount: input.knownAmount,
      knownQuality: 'estimated',
      recognitionSource,
      status: 'draft',
    });
    await db.insert(laborAllocationRuns).values({
      id: runId,
      organizationId: input.organizationId,
      employeeMonthCostId: monthId,
      method: 'fixed_amount',
      status: 'draft',
      currency: ILS,
      allocatedAmount: allocated,
      unallocatedAmount: unallocated,
    });
    await db.insert(laborAllocationRunLines).values({
      organizationId: input.organizationId,
      laborAllocationRunId: runId,
      projectId: input.projectId,
      amount: allocated,
      currency: ILS,
      sortOrder: 0,
    });
    await db
      .update(laborAllocationRuns)
      .set({ status: 'applied', appliedAt: new Date() })
      .where(eq(laborAllocationRuns.id, runId));
    await db
      .update(employeeMonthCosts)
      .set({ status: 'applied' })
      .where(eq(employeeMonthCosts.id, monthId));
  });
}

/**
 * F14 money-chain matrix (PGlite) — rows tied to FIN-CORE / F03 in Gate A.
 * Full 15-scenario matrix: PGlite-feasible rows here; Playwright + contractor/billing rows in Stage 6.
 */
describe('F14 money-chain matrix (PGlite, Gate A)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let materialsCategoryId: string;
  let projectId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyGateAFinancialIntegrationMigrations(database);
  }, 120_000);

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    owner = await createTestUser(database, `f14-matrix-${randomUUID()}@test.local`);
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'F14 matrix org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;
    materialsCategoryId = await findCostCategoryId(database, orgId);
    projectId = await createProjectWithDefaultPackage(database, owner.id, orgId, 'Matrix project');
  });

  afterAll(async () => {
    await database.close();
  });

  async function monthlyNet(from: string, to: string) {
    return database.asUser(owner.id, async (tx) => {
      const pair = await sumOrganizationRecognizedCostPairInDateRange(
        tx,
        orgId,
        ILS,
        businessDate(from),
        businessDate(to),
      );
      return pair.net.amount;
    });
  }

  async function withContext<T>(fn: (context: Awaited<ReturnType<typeof resolveOrgContext>>) => Promise<T>) {
    return database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      return fn(context);
    });
  }

  it('row 1 — partial pay: 12×1k NET, 3 verified → project 3k; Jan–Mar 1k/mo; cash 3,540 paid / 10,620 expected', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const draft = await createExpense(context, {
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        description: '12x installment',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);

      for (const paidAt of ['2026-01-15', '2026-02-15', '2026-03-15'] as const) {
        await confirmExpensePaid(context, draft.id, {
          paidAt: businessDate(paidAt),
          paidGrossAmount: '1180.000000',
        });
      }

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('3000.000000');
    });

    expect(await monthlyNet('2026-01-01', '2026-01-31')).toBe('1000.000000');
    expect(await monthlyNet('2026-02-01', '2026-02-28')).toBe('1000.000000');
    expect(await monthlyNet('2026-03-01', '2026-03-31')).toBe('1000.000000');

    await withContext(async (context) => {
      const yearBook = await loadFinancialYearBookData(context, 2026);
      for (const ym of ['2026-01', '2026-02', '2026-03'] as const) {
        const month = yearBook.months.find((m) => m.period.yearMonth === ym);
        expect(month?.summary.recognizedCostNet?.amount).toBe('1000.000000');
      }

      const breakdown = await listOrganizationRecognizedCostBreakdownInDateRange(
        context.db,
        orgId,
        ILS,
        businessDate('2026-01-01'),
        businessDate('2026-03-31'),
      );
      const installmentNet = breakdown
        .filter((line) => line.sourceKind === 'expense')
        .reduce((sum, line) => sum + Number(line.net.amount), 0);
      expect(installmentNet.toFixed(6)).toBe('3000.000000');

      const cashFlow = await getMonthCashFlow(context, {
        from: businessDate('2026-01-01'),
        to: businessDate('2026-12-31'),
        collectionsActual: zeroMoney(ILS),
      });
      expect(cashFlow.paidActual.amount).toBe('3540.000000');
      expect(cashFlow.expectedOutgoing.amount).toBe('10620.000000');
    });
  });

  it('row 2 — zero payments: 9×10k NET → project 0, monthly 0, expected outgoing 106,200', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const draft = await createExpense(context, {
        netAmount: '90000',
        amount: '106200',
        currency: ILS,
        vatMode: 'exclusive',
        description: 'Nine unpaid installments',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 9,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('0.000000');
    });

    expect(await monthlyNet('2026-01-01', '2026-12-31')).toBe('0.000000');

    await withContext(async (context) => {
      const cashFlow = await getMonthCashFlow(context, {
        from: businessDate('2026-01-01'),
        to: businessDate('2026-12-31'),
        collectionsActual: zeroMoney(ILS),
      });
      expect(cashFlow.paidActual.amount).toBe('0.000000');
      expect(cashFlow.expectedOutgoing.amount).toBe('106200.000000');
    });
  });

  it('row 3 — confirm installment pay then void → project/monthly/cash 0; two payment audit events', async () => {
    let expenseId = '';

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const draft = await createExpense(context, {
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        description: 'Pay then void installment',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);
      expenseId = draft.id;

      await confirmExpensePaid(context, draft.id, {
        paidAt: businessDate('2026-03-15'),
        paidGrossAmount: '1180.000000',
      });
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('1000.000000');
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      await voidExpensePaymentConfirmation(context, expenseId);
      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('0.000000');
    });

    expect(await monthlyNet('2026-03-01', '2026-03-31')).toBe('0.000000');

    await withContext(async (context) => {
      const cashFlow = await getMonthCashFlow(context, {
        from: businessDate('2026-03-01'),
        to: businessDate('2026-03-31'),
        collectionsActual: zeroMoney(ILS),
      });
      expect(cashFlow.paidActual.amount).toBe('0.000000');
    });

    const auditRows = await database.asUser(owner.id, async (tx) =>
      tx
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, orgId),
            eq(auditEvents.entityType, 'expense'),
            eq(auditEvents.entityId, expenseId),
          ),
        ),
    );
    expect(auditRows.some((row) => row.action === 'expense.payment_confirmed')).toBe(true);
    expect(auditRows.some((row) => row.action === 'expense.payment_confirmation_voided')).toBe(true);
  });

  it('row 4 — two projects 50/50 expense 10k + AP bill 10k matched → A/B 5k each, monthly 10k', async () => {
    const projectAId = projectId;
    const projectBId = await createProjectWithDefaultPackage(
      database,
      owner.id,
      orgId,
      'Matrix project B',
    );

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Row 4 vendor' });
      const draft = await createExpense(context, {
        netAmount: '10000',
        amount: '10000',
        currency: ILS,
        vatMode: 'zero',
        description: 'Split vendor expense',
        costFamily: 'direct_project',
        costCategoryId: materialsCategoryId,
        expenseDate: '2026-03-08',
        allocationIntent: 'project_allocate',
        allocations: [
          {
            targetType: 'project',
            projectId: projectAId,
            method: 'manual_amount',
            amount: '5000',
            sortOrder: 0,
          },
          {
            targetType: 'project',
            projectId: projectBId,
            method: 'manual_amount',
            amount: '5000',
            sortOrder: 1,
          },
        ],
      });
      await finalizeExpense(context, draft.id);

      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency: ILS,
        totalAmount: '10000',
        billDate: '2026-03-09',
        dueDate: '2026-04-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Matched bill',
              quantity: '1',
              unitAmount: '10000',
              lineTotal: '10000',
              currency: ILS,
            },
          ],
          materialsCategoryId,
        ),
      });
      const match = await proposeApMatch(context, {
        apBillId: bill.id,
        expenseId: draft.id,
        matchedAmount: '10000',
        currency: ILS,
      });
      await acceptApMatch(context, { matchId: match.id });

      const finA = await getProjectFinancials(context, projectAId);
      const finB = await getProjectFinancials(context, projectBId);
      expect(finA.cost.actualCostToDate.amount).toBe('5000.000000');
      expect(finB.cost.actualCostToDate.amount).toBe('5000.000000');
    });

    expect(await monthlyNet('2026-03-01', '2026-03-31')).toBe('10000.000000');
  });

  it('row 5 — bill 5k − credit 1k → project/monthly 4k; open AP cash obligation', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Row 5 vendor' });
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        projectId,
        currency: ILS,
        totalAmount: '5000',
        billDate: '2026-03-05',
        dueDate: '2026-04-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Row 5 bill',
              quantity: '1',
              unitAmount: '5000',
              lineTotal: '5000',
              currency: ILS,
            },
          ],
          materialsCategoryId,
        ),
      });
      const credit = await createVendorCredit(context, {
        vendorId: vendor.id,
        apBillId: bill.id,
        projectId,
        currency: ILS,
        amount: '1000',
        creditDate: '2026-03-06',
        reference: 'ROW5-CR',
      });
      await postVendorCredit(context, credit.id);
      await applyVendorCredit(context, {
        creditId: credit.id,
        apBillId: bill.id,
        amount: '1000',
      });

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('4000.000000');
    });

    expect(await monthlyNet('2026-03-01', '2026-03-31')).toBe('4000.000000');
  });

  it('row 7 — EMC 27k (60% on project) → project 16.2k, monthly/year-book 27k', async () => {
    const employeeId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Row 7 worker',
        status: 'active',
      });
    });

    await seedAppliedEmployeeMonthCost(
      database,
      {
        organizationId: orgId,
        employeeId,
        yearMonth: '2026-03',
        knownAmount: '27000.000000',
        projectId,
      },
      {
        recognitionSource: 'monthly_allocated',
        projectAllocatedAmount: '16200.000000',
      },
    );

    await withContext(async (context) => {
      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('16200.000000');

      const yearBook = await loadFinancialYearBookData(context, 2026);
      const march = yearBook.months.find((m) => m.period.yearMonth === '2026-03');
      expect(march?.summary.recognizedCostNet?.amount).toBe('27000.000000');
      expect(march?.employerCosts.some((row) => row.nature === 'final')).toBe(true);
    });

    expect(await monthlyNet('2026-03-01', '2026-03-31')).toBe('27000.000000');
  });

  it('row 8 — 24×500 NET, Jan 2026, 10 pays through Oct → project 5k; 500/mo Jan–Oct; expected 8,260', async () => {
    const paidMonths = [
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
      '2026-06-15',
      '2026-07-15',
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
    ] as const;

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const draft = await createExpense(context, {
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        description: '24x small installments',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 24,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);

      for (const paidAt of paidMonths) {
        await confirmExpensePaid(context, draft.id, {
          paidAt: businessDate(paidAt),
          paidGrossAmount: '590.000000',
        });
      }

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('5000.000000');
    });

    for (const ym of [
      ['2026-01-01', '2026-01-31'],
      ['2026-10-01', '2026-10-31'],
    ] as const) {
      expect(await monthlyNet(ym[0], ym[1])).toBe('500.000000');
    }
    expect(await monthlyNet('2026-11-01', '2026-11-30')).toBe('0.000000');

    await withContext(async (context) => {
      const cashFlow = await getMonthCashFlow(context, {
        from: businessDate('2026-01-01'),
        to: businessDate('2027-12-31'),
        collectionsActual: zeroMoney(ILS),
      });
      expect(cashFlow.paidActual.amount).toBe('5900.000000');
      expect(cashFlow.expectedOutgoing.amount).toBe('8260.000000');
    });
  });

  it('row 13b — one-time 10k Feb purchase, paid in full Mar → project 10k; Mar 10k / Feb 0', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const draft = await createExpense(context, {
        netAmount: '10000',
        amount: '11800',
        currency: ILS,
        vatMode: 'exclusive',
        description: 'Timing preservation',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-02-10',
      });
      await finalizeExpense(context, draft.id);

      await confirmExpensePaid(context, draft.id, {
        paidAt: businessDate('2026-03-05'),
        paidGrossAmount: '11800.000000',
      });

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('10000.000000');
    });

    expect(await monthlyNet('2026-02-01', '2026-02-28')).toBe('0.000000');
    expect(await monthlyNet('2026-03-01', '2026-03-31')).toBe('10000.000000');
  });

  it('row 15 (OD-06) — installment 12×1k + AP bill 12k matched after 3 pays → project/cash align row 1', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Row 15 vendor' });
      const draft = await createExpense(context, {
        netAmount: '12000',
        amount: '14160',
        currency: ILS,
        vatMode: 'exclusive',
        description: 'Installment + AP',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 12,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);

      for (const paidAt of ['2026-01-15', '2026-02-15', '2026-03-15'] as const) {
        await confirmExpensePaid(context, draft.id, {
          paidAt: businessDate(paidAt),
          paidGrossAmount: '1180.000000',
        });
      }

      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency: ILS,
        totalAmount: '12000',
        billDate: '2026-03-20',
        dueDate: '2026-04-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Full match bill',
              quantity: '1',
              unitAmount: '12000',
              lineTotal: '12000',
              currency: ILS,
            },
          ],
          materialsCategoryId,
        ),
      });
      const match = await proposeApMatch(context, {
        apBillId: bill.id,
        expenseId: draft.id,
        matchedAmount: '12000',
        currency: ILS,
      });
      await acceptApMatch(context, { matchId: match.id });

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('3000.000000');
    });

    await withContext(async (context) => {
      const cashFlow = await getMonthCashFlow(context, {
        from: businessDate('2026-01-01'),
        to: businessDate('2026-12-31'),
        collectionsActual: zeroMoney(ILS),
      });
      expect(cashFlow.paidActual.amount).toBe('3540.000000');
      // Matched AP bill adds open vendor obligation to expected outgoing (OD-06).
      expect(cashFlow.expectedOutgoing.amount).toBe('13620.000000');
    });
  });
});
