import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { expenseAllocations, expenses, projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { localizeProjectDisplayName } from '@/shared/i18n/code-display';
import type { BusinessDate } from '@/shared/dates';
import {
  resolveVendorExpenseActivityKind,
  resolveVendorExpensePaymentDisplay,
  vendorExpenseCountsTowardOutstanding,
  vendorExpenseCountsTowardPaid,
  type VendorExpenseActivityKind,
  type VendorExpensePaymentDisplay,
} from '../domain/vendor-expense-activity-display';

export interface VendorExpenseProjectAllocation {
  readonly projectId: string;
  readonly projectName: string;
  readonly netAmount: string;
  readonly percent: string | null;
}

export interface VendorExpenseActivityRow {
  readonly id: string;
  readonly expenseDate: BusinessDate;
  readonly description: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly status: string;
  readonly allocationIntent: string | null;
  readonly paymentStatus: string | null;
  readonly paidAt: BusinessDate | null;
  readonly paidGrossAmount: string | null;
  readonly dueDate: BusinessDate | null;
  readonly voidsExpenseId: string | null;
  readonly adjustsExpenseId: string | null;
  readonly hasActiveReversal: boolean;
  readonly kind: VendorExpenseActivityKind;
  readonly paymentDisplay: VendorExpensePaymentDisplay;
  readonly projectAllocationCount: number;
  readonly projectAllocations: readonly VendorExpenseProjectAllocation[];
}

export interface VendorDerivedProject {
  readonly id: string;
  readonly name: string;
  readonly expenseCount: number;
  readonly recognizedNet: string;
  readonly paidGross: string;
  readonly currency: string;
}

export interface VendorFinancialActivity {
  readonly expenses: readonly VendorExpenseActivityRow[];
  readonly derivedProjects: readonly VendorDerivedProject[];
  readonly totals: {
    readonly recognizedNet: string;
    readonly paidGross: string;
    readonly outstandingGross: string;
    readonly currency: string;
    readonly expenseCount: number;
  };
}

export async function getVendorFinancialActivity(
  context: OrgContext,
  vendorId: string,
): Promise<VendorFinancialActivity> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const locale = context.locale ?? 'he-IL';

  const rows = await context.db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      description: expenses.description,
      projectId: expenses.projectId,
      projectName: projects.name,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      status: expenses.status,
      allocationIntent: expenses.allocationIntent,
      paymentStatus: expenses.paymentStatus,
      paidAt: expenses.paidAt,
      paidGrossAmount: expenses.paidGrossAmount,
      dueDate: expenses.dueDate,
      voidsExpenseId: expenses.voidsExpenseId,
      adjustsExpenseId: expenses.adjustsExpenseId,
    })
    .from(expenses)
    .leftJoin(projects, eq(expenses.projectId, projects.id))
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.vendorId, vendorId),
        isNull(expenses.archivedAt),
      ),
    )
    .orderBy(desc(expenses.expenseDate))
    .limit(200);

  const expenseIds = rows.map((row) => row.id);
  const reversedOriginalIds = new Set(
    rows
      .map((row) => row.voidsExpenseId)
      .filter((value): value is string => Boolean(value)),
  );

  const allocationRows =
    expenseIds.length > 0
      ? await context.db
          .select({
            expenseId: expenseAllocations.expenseId,
            projectId: expenseAllocations.projectId,
            projectName: projects.name,
            amount: expenseAllocations.amount,
            percent: expenseAllocations.percent,
            targetType: expenseAllocations.targetType,
          })
          .from(expenseAllocations)
          .leftJoin(projects, eq(expenseAllocations.projectId, projects.id))
          .where(
            and(
              eq(expenseAllocations.organizationId, context.organizationId),
              inArray(expenseAllocations.expenseId, expenseIds),
            ),
          )
      : [];

  const allocationsByExpense = new Map<string, VendorExpenseProjectAllocation[]>();
  for (const line of allocationRows) {
    if (line.targetType !== 'project' || !line.projectId) continue;
    const existing = allocationsByExpense.get(line.expenseId) ?? [];
    existing.push({
      projectId: line.projectId,
      projectName: line.projectName
        ? localizeProjectDisplayName(locale, line.projectName)
        : line.projectId,
      netAmount: String(line.amount),
      percent: line.percent ? String(line.percent) : null,
    });
    allocationsByExpense.set(line.expenseId, existing);
  }

  const expensesList: VendorExpenseActivityRow[] = rows.map((row) => {
    const projectAllocations = allocationsByExpense.get(row.id) ?? [];
    const hasActiveReversal = reversedOriginalIds.has(row.id);
    const kind = resolveVendorExpenseActivityKind({
      voidsExpenseId: row.voidsExpenseId,
      adjustsExpenseId: row.adjustsExpenseId,
    });
    return {
      id: row.id,
      expenseDate: row.expenseDate as BusinessDate,
      description: row.description,
      projectId: row.projectId,
      projectName: row.projectName
        ? localizeProjectDisplayName(locale, row.projectName)
        : null,
      netAmount: String(row.netAmount),
      grossAmount: String(row.grossAmount),
      currency: row.currency,
      status: row.status,
      allocationIntent: row.allocationIntent ?? null,
      paymentStatus: row.paymentStatus,
      paidAt: (row.paidAt as BusinessDate | null) ?? null,
      paidGrossAmount: row.paidGrossAmount ? String(row.paidGrossAmount) : null,
      dueDate: (row.dueDate as BusinessDate | null) ?? null,
      voidsExpenseId: row.voidsExpenseId,
      adjustsExpenseId: row.adjustsExpenseId,
      hasActiveReversal,
      kind,
      paymentDisplay: resolveVendorExpensePaymentDisplay({
        kind,
        hasActiveReversal,
        grossAmount: String(row.grossAmount),
        paymentStatus: row.paymentStatus,
      }),
      projectAllocationCount: projectAllocations.length,
      projectAllocations,
    };
  });

  const currency = expensesList[0]?.currency ?? context.organization.baseCurrency;
  let recognizedNet = 0;
  let paidGross = 0;
  let outstandingGross = 0;

  const projectAgg = new Map<string, VendorDerivedProject>();

  for (const row of expensesList) {
    if (row.status !== 'finalized') continue;
    const net = Number(row.netAmount);
    recognizedNet += net;

    if (
      vendorExpenseCountsTowardPaid({
        kind: row.kind,
        hasActiveReversal: row.hasActiveReversal,
        paymentStatus: row.paymentStatus,
        paidGrossAmount: row.paidGrossAmount,
      })
    ) {
      paidGross += Number(row.paidGrossAmount);
    }

    if (
      vendorExpenseCountsTowardOutstanding({
        kind: row.kind,
        hasActiveReversal: row.hasActiveReversal,
        grossAmount: row.grossAmount,
        status: row.status,
      }) &&
      row.paymentStatus !== 'paid'
    ) {
      outstandingGross += Number(row.grossAmount);
    }

    const projectLines =
      row.projectAllocations.length > 0
        ? row.projectAllocations
        : row.projectId && row.projectName
          ? [
              {
                projectId: row.projectId,
                projectName: row.projectName,
                netAmount: row.netAmount,
                percent: null,
              },
            ]
          : [];

    const paidShareForProjectLine = (lineNet: number): number => {
      if (
        !vendorExpenseCountsTowardPaid({
          kind: row.kind,
          hasActiveReversal: row.hasActiveReversal,
          paymentStatus: row.paymentStatus,
          paidGrossAmount: row.paidGrossAmount,
        }) ||
        !row.paidGrossAmount
      ) {
        return 0;
      }
      if (projectLines.length === 1) return Number(row.paidGrossAmount);
      if (net <= 0) return 0;
      return Number(row.paidGrossAmount) * (lineNet / net);
    };

    for (const projectLine of projectLines) {
      const lineNet = Number(projectLine.netAmount);
      const paidShare = paidShareForProjectLine(lineNet);
      const existing = projectAgg.get(projectLine.projectId);
      if (existing) {
        projectAgg.set(projectLine.projectId, {
          ...existing,
          expenseCount: existing.expenseCount + 1,
          recognizedNet: String(Number(existing.recognizedNet) + lineNet),
          paidGross: String(Number(existing.paidGross) + paidShare),
        });
      } else {
        projectAgg.set(projectLine.projectId, {
          id: projectLine.projectId,
          name: projectLine.projectName,
          expenseCount: 1,
          recognizedNet: String(lineNet),
          paidGross: String(paidShare),
          currency: row.currency,
        });
      }
    }
  }

  return {
    expenses: expensesList,
    derivedProjects: [...projectAgg.values()].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    totals: {
      recognizedNet: recognizedNet.toFixed(2),
      paidGross: paidGross.toFixed(2),
      outstandingGross: outstandingGross.toFixed(2),
      currency,
      expenseCount: expensesList.filter((row) => row.status === 'finalized' && row.kind === 'expense').length,
    },
  };
}
