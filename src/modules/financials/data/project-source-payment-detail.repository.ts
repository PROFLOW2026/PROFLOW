import { and, eq, inArray, isNull } from 'drizzle-orm';
import { costCategories, expenseAllocations, expenses, vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BusinessDate } from '@/shared/dates';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { resolveExpensePaymentObligation } from '@/modules/expenses/domain/resolve-expense-payment-obligation';
import type {
  ProjectCostPaymentSummary,
  ProjectSourcePaymentDetail,
} from '../domain/project-source-payment-detail';

function resolveDisplayPaymentStatus(input: {
  readonly paymentStatus: string | null;
  readonly paidGross: MoneyValue;
  readonly remainingGross: MoneyValue;
  readonly grossTotal: MoneyValue;
}): ProjectSourcePaymentDetail['paymentStatus'] {
  if (input.paymentStatus === 'paid') return 'paid';
  if (isZeroMoney(input.remainingGross)) return 'paid';
  if (!isZeroMoney(input.paidGross) && !isZeroMoney(input.remainingGross)) return 'partial';
  if (input.paymentStatus === 'overdue') return 'overdue';
  if (input.paymentStatus === 'due') return 'due';
  if (input.paymentStatus === 'upcoming') return 'upcoming';
  return 'unpaid';
}

async function loadExpensePaymentDetailsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{
  readonly details: readonly ProjectSourcePaymentDetail[];
  readonly summary: Pick<
    ProjectCostPaymentSummary,
    'sourcePaidGross' | 'sourceRemainingGross' | 'multiProjectSourceCount' | 'expenseSourceCount'
  >;
}> {
  const normalized = currency.toUpperCase();

  const directRows = await db
    .select({
      id: expenses.id,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      expenseDate: expenses.expenseDate,
      dueDate: expenses.dueDate,
      paymentStatus: expenses.paymentStatus,
      paidGrossAmount: expenses.paidGrossAmount,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidAt: expenses.paidAt,
      vendorName: vendors.name,
      categoryKey: costCategories.key,
      projectId: expenses.projectId,
    })
    .from(expenses)
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.projectId, projectId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        eq(expenses.inventoryStockPurchase, false),
      ),
    );

  const allocationRows = await db
    .select({
      expenseId: expenseAllocations.expenseId,
      projectNet: expenseAllocations.amount,
      percent: expenseAllocations.percent,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      expenseDate: expenses.expenseDate,
      dueDate: expenses.dueDate,
      paymentStatus: expenses.paymentStatus,
      paidGrossAmount: expenses.paidGrossAmount,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidAt: expenses.paidAt,
      vendorName: vendors.name,
      categoryKey: costCategories.key,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .where(
      and(
        eq(expenseAllocations.organizationId, organizationId),
        eq(expenseAllocations.projectId, projectId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        eq(expenses.inventoryStockPurchase, false),
      ),
    );

  const expenseIds = [
    ...new Set([
      ...directRows.map((r) => r.id),
      ...allocationRows.map((r) => r.expenseId),
    ]),
  ];

  const touchCounts =
    expenseIds.length === 0
      ? new Map<string, number>()
      : await (async () => {
          const counts = await db
            .select({
              expenseId: expenses.id,
              direct: expenses.projectId,
            })
            .from(expenses)
            .where(
              and(
                eq(expenses.organizationId, organizationId),
                inArray(expenses.id, expenseIds),
              ),
            );
          const allocCounts = await db
            .select({
              expenseId: expenseAllocations.expenseId,
              projectId: expenseAllocations.projectId,
            })
            .from(expenseAllocations)
            .where(
              and(
                eq(expenseAllocations.organizationId, organizationId),
                inArray(expenseAllocations.expenseId, expenseIds),
              ),
            );
          const map = new Map<string, Set<string>>();
          for (const row of counts) {
            const set = map.get(row.expenseId) ?? new Set<string>();
            if (row.direct) set.add(row.direct);
            map.set(row.expenseId, set);
          }
          for (const row of allocCounts) {
            const set = map.get(row.expenseId) ?? new Set<string>();
            if (row.projectId) set.add(row.projectId);
            map.set(row.expenseId, set);
          }
          return new Map([...map.entries()].map(([id, set]) => [id, set.size]));
        })();

  const details: ProjectSourcePaymentDetail[] = [];
  const seenForSummary = new Set<string>();
  let sourcePaidGross = zeroMoney(normalized);
  let sourceRemainingGross = zeroMoney(normalized);
  let multiProjectSourceCount = 0;

  const pushDetail = (input: {
    expenseId: string;
    projectNet: MoneyValue;
    percent: string | null;
    row: (typeof directRows)[number] | (typeof allocationRows)[number];
  }) => {
    const grossTotal =
      fromNumericString(String(input.row.grossAmount), normalized) ?? zeroMoney(normalized);
    const netTotal =
      fromNumericString(String(input.row.netAmount), normalized) ?? zeroMoney(normalized);
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: grossTotal.amount,
        currency: normalized,
        expenseDate: input.row.expenseDate as BusinessDate,
        installmentCount: Number(input.row.installmentCount ?? 1),
        installmentStartDate: (input.row.installmentStartDate as BusinessDate | null) ?? null,
        installmentsPaidCount: Number(input.row.installmentsPaidCount ?? 0),
        paidGrossAmount: input.row.paidGrossAmount ? String(input.row.paidGrossAmount) : null,
        dueDate: (input.row.dueDate as BusinessDate | null) ?? null,
        paymentStatus: input.row.paymentStatus,
        paidAt: (input.row.paidAt as BusinessDate | null) ?? null,
      },
      input.row.dueDate ? (input.row.dueDate as BusinessDate) : (input.row.expenseDate as BusinessDate),
    );

    const touchCount = touchCounts.get(input.expenseId) ?? 1;
    const touchesMultipleProjects = touchCount > 1;
    if (touchesMultipleProjects) multiProjectSourceCount += 1;

    if (!seenForSummary.has(input.expenseId)) {
      seenForSummary.add(input.expenseId);
      sourcePaidGross = addMoney(sourcePaidGross, obligation.totalPaid);
      sourceRemainingGross = addMoney(sourceRemainingGross, obligation.totalRemaining);
    }

    details.push({
      sourceKind: 'expense',
      sourceId: input.expenseId,
      vendorName: input.row.vendorName,
      categoryKey: input.row.categoryKey,
      expenseDate: input.row.expenseDate as BusinessDate,
      dueDate: obligation.effectiveDueDate,
      recognizedNetOnProject: roundMoney(input.projectNet),
      sourceNetTotal: roundMoney(netTotal),
      sourceGrossTotal: roundMoney(grossTotal),
      paidGross: roundMoney(obligation.totalPaid),
      remainingGross: roundMoney(obligation.totalRemaining),
      paymentStatus: resolveDisplayPaymentStatus({
        paymentStatus: obligation.paymentStatus,
        paidGross: obligation.totalPaid,
        remainingGross: obligation.totalRemaining,
        grossTotal,
      }),
      projectSharePercent: input.percent,
      touchesMultipleProjects,
      projectTouchCount: touchCount,
    });
  };

  for (const row of directRows) {
    const projectNet =
      fromNumericString(String(row.netAmount), normalized) ?? zeroMoney(normalized);
    pushDetail({ expenseId: row.id, projectNet, percent: '100', row });
  }

  for (const row of allocationRows) {
    const projectNet =
      fromNumericString(String(row.projectNet), normalized) ?? zeroMoney(normalized);
    pushDetail({
      expenseId: row.expenseId,
      projectNet,
      percent: row.percent ? String(row.percent) : null,
      row,
    });
  }

  return {
    details,
    summary: {
      sourcePaidGross: roundMoney(sourcePaidGross),
      sourceRemainingGross: roundMoney(sourceRemainingGross),
      multiProjectSourceCount,
      expenseSourceCount: seenForSummary.size,
    },
  };
}

export async function loadProjectSourcePaymentDetails(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{
  readonly bySourceId: ReadonlyMap<string, ProjectSourcePaymentDetail>;
  readonly summary: Omit<ProjectCostPaymentSummary, 'recognizedNet' | 'apOutstandingGross'>;
}> {
  const expensePack = await loadExpensePaymentDetailsForProject(
    db,
    organizationId,
    projectId,
    currency,
  );

  const bySourceId = new Map<string, ProjectSourcePaymentDetail>();
  for (const detail of expensePack.details) {
    bySourceId.set(detail.sourceId, detail);
  }

  return {
    bySourceId,
    summary: {
      currency: currency.toUpperCase(),
      sourcePaidGross: expensePack.summary.sourcePaidGross,
      sourceRemainingGross: expensePack.summary.sourceRemainingGross,
      multiProjectSourceCount: expensePack.summary.multiProjectSourceCount,
      expenseSourceCount: expensePack.summary.expenseSourceCount,
    },
  };
}

export function buildProjectCostPaymentSummary(input: {
  readonly currency: string;
  readonly recognizedNet: MoneyValue;
  readonly apOutstandingGross: MoneyValue | null;
  readonly sourcePaidGross: MoneyValue;
  readonly sourceRemainingGross: MoneyValue;
  readonly multiProjectSourceCount: number;
  readonly expenseSourceCount: number;
}): ProjectCostPaymentSummary {
  return {
    currency: input.currency.toUpperCase(),
    recognizedNet: input.recognizedNet,
    sourcePaidGross: input.sourcePaidGross,
    sourceRemainingGross: input.sourceRemainingGross,
    apOutstandingGross: input.apOutstandingGross,
    multiProjectSourceCount: input.multiProjectSourceCount,
    expenseSourceCount: input.expenseSourceCount,
  };
}
