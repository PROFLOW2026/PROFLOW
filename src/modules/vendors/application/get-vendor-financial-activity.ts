import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { expenseAllocations, expenseInstallmentPayments, expenses, projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { localizeProjectDisplayName } from '@/shared/i18n/code-display';
import type { BusinessDate } from '@/shared/dates';
import {
  resolveVendorExpenseActivityKind,
  resolveVendorExpensePaymentDisplay,
  vendorExpenseCountsTowardOutstanding,
  type VendorExpenseActivityKind,
  type VendorExpensePaymentDisplay,
} from '../domain/vendor-expense-activity-display';
import { resolveVendorAggregateScope } from '../domain/resolve-vendor-aggregate-ids';
import { resolveVendorExpenseCashPaid } from '../domain/vendor-expense-cash-paid';

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
  readonly paidNetAmount: string;
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
  readonly recognizedGross: string;
  readonly paidNet: string;
  readonly paidGross: string;
  readonly currency: string;
}

export type VendorFinancialAmountBasis = 'net' | 'gross';

export interface VendorFinancialBasisTotals {
  readonly recognized: string;
  readonly paid: string;
  readonly outstanding: string;
}

export interface VendorFinancialActivity {
  readonly canonicalVendorId: string;
  readonly aggregateVendorIds: readonly string[];
  readonly expenses: readonly VendorExpenseActivityRow[];
  readonly derivedProjects: readonly VendorDerivedProject[];
  readonly totals: {
    readonly currency: string;
    readonly expenseCount: number;
    readonly net: VendorFinancialBasisTotals;
    readonly gross: VendorFinancialBasisTotals;
  };
}

export async function getVendorFinancialActivity(
  context: OrgContext,
  vendorId: string,
): Promise<VendorFinancialActivity> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const locale = context.locale ?? 'he-IL';
  const scope = await resolveVendorAggregateScope(context, vendorId);
  const vendorIds = scope.expenseVendorIds;

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
        inArray(expenses.vendorId, [...vendorIds]),
        isNull(expenses.archivedAt),
      ),
    )
    .orderBy(desc(expenses.expenseDate))
    .limit(500);

  const expenseIds = rows.map((row) => row.id);
  const reversedOriginalIds = new Set(
    rows
      .map((row) => row.voidsExpenseId)
      .filter((value): value is string => Boolean(value)),
  );

  const installmentRows =
    expenseIds.length > 0
      ? await context.db
          .select({
            expenseId: expenseInstallmentPayments.expenseId,
            grossPaid: expenseInstallmentPayments.grossPaid,
            netPaid: expenseInstallmentPayments.netPaid,
            status: expenseInstallmentPayments.status,
          })
          .from(expenseInstallmentPayments)
          .where(
            and(
              eq(expenseInstallmentPayments.organizationId, context.organizationId),
              inArray(expenseInstallmentPayments.expenseId, expenseIds),
              eq(expenseInstallmentPayments.status, 'paid'),
            ),
          )
      : [];

  const installmentByExpense = new Map<string, { gross: number; net: number }>();
  for (const line of installmentRows) {
    const existing = installmentByExpense.get(line.expenseId) ?? { gross: 0, net: 0 };
    installmentByExpense.set(line.expenseId, {
      gross: existing.gross + Number(line.grossPaid),
      net: existing.net + Number(line.netPaid),
    });
  }

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
    const inst = installmentByExpense.get(row.id) ?? { gross: 0, net: 0 };
    const cashPaid = resolveVendorExpenseCashPaid({
      kind,
      hasActiveReversal,
      paymentStatus: row.paymentStatus,
      paidGrossAmount: row.paidGrossAmount ? String(row.paidGrossAmount) : null,
      netAmount: String(row.netAmount),
      grossAmount: String(row.grossAmount),
      installmentPaidGross: inst.gross,
      installmentPaidNet: inst.net,
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
      paidNetAmount: cashPaid.net.toFixed(2),
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
  let recognizedGross = 0;
  let paidNet = 0;
  let paidGross = 0;
  let outstandingNet = 0;
  let outstandingGross = 0;

  const projectAgg = new Map<string, VendorDerivedProject>();

  for (const row of expensesList) {
    if (row.status !== 'finalized') continue;
    const net = Number(row.netAmount);
    const gross = Number(row.grossAmount);
    recognizedNet += net;
    recognizedGross += gross;

    const inst = installmentByExpense.get(row.id) ?? { gross: 0, net: 0 };
    const cashPaid = resolveVendorExpenseCashPaid({
      kind: row.kind,
      hasActiveReversal: row.hasActiveReversal,
      paymentStatus: row.paymentStatus,
      paidGrossAmount: row.paidGrossAmount,
      netAmount: row.netAmount,
      grossAmount: row.grossAmount,
      installmentPaidGross: inst.gross,
      installmentPaidNet: inst.net,
    });
    paidNet += cashPaid.net;
    paidGross += cashPaid.gross;

    if (
      vendorExpenseCountsTowardOutstanding({
        kind: row.kind,
        hasActiveReversal: row.hasActiveReversal,
        grossAmount: row.grossAmount,
        status: row.status,
      }) &&
      row.paymentStatus !== 'paid'
    ) {
      outstandingGross += Math.max(0, gross - cashPaid.gross);
      outstandingNet += Math.max(0, net - cashPaid.net);
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

    const paidShareForProjectLine = (lineNet: number): { net: number; gross: number } => {
      if (cashPaid.gross <= 0) return { net: 0, gross: 0 };
      if (projectLines.length === 1) return { net: cashPaid.net, gross: cashPaid.gross };
      if (net <= 0) return { net: 0, gross: 0 };
      const ratio = lineNet / net;
      return { net: cashPaid.net * ratio, gross: cashPaid.gross * ratio };
    };

    for (const projectLine of projectLines) {
      const lineNet = Number(projectLine.netAmount);
      const lineGross = net > 0 ? (lineNet / net) * gross : 0;
      const paidShare = paidShareForProjectLine(lineNet);
      const existing = projectAgg.get(projectLine.projectId);
      if (existing) {
        projectAgg.set(projectLine.projectId, {
          ...existing,
          expenseCount: existing.expenseCount + 1,
          recognizedNet: String(Number(existing.recognizedNet) + lineNet),
          recognizedGross: String(Number(existing.recognizedGross) + lineGross),
          paidNet: String(Number(existing.paidNet) + paidShare.net),
          paidGross: String(Number(existing.paidGross) + paidShare.gross),
        });
      } else {
        projectAgg.set(projectLine.projectId, {
          id: projectLine.projectId,
          name: projectLine.projectName,
          expenseCount: 1,
          recognizedNet: String(lineNet),
          recognizedGross: String(lineGross),
          paidNet: String(paidShare.net),
          paidGross: String(paidShare.gross),
          currency: row.currency,
        });
      }
    }
  }

  const expenseCount = expensesList.filter(
    (row) => row.status === 'finalized' && row.kind === 'expense' && !row.hasActiveReversal,
  ).length;

  return {
    canonicalVendorId: scope.canonicalVendorId,
    aggregateVendorIds: vendorIds,
    expenses: expensesList,
    derivedProjects: [...projectAgg.values()].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    totals: {
      currency,
      expenseCount,
      net: {
        recognized: recognizedNet.toFixed(2),
        paid: paidNet.toFixed(2),
        outstanding: outstandingNet.toFixed(2),
      },
      gross: {
        recognized: recognizedGross.toFixed(2),
        paid: paidGross.toFixed(2),
        outstanding: outstandingGross.toFixed(2),
      },
    },
  };
}
