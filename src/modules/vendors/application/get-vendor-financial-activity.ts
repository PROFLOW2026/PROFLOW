import { and, desc, eq, isNull } from 'drizzle-orm';
import { expenses, projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { localizeProjectDisplayName } from '@/shared/i18n/code-display';
import type { BusinessDate } from '@/shared/dates';

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
  readonly paymentStatus: string | null;
  readonly paidAt: BusinessDate | null;
  readonly paidGrossAmount: string | null;
  readonly dueDate: BusinessDate | null;
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
      paymentStatus: expenses.paymentStatus,
      paidAt: expenses.paidAt,
      paidGrossAmount: expenses.paidGrossAmount,
      dueDate: expenses.dueDate,
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

  const expensesList: VendorExpenseActivityRow[] = rows.map((row) => ({
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
    paymentStatus: row.paymentStatus,
    paidAt: (row.paidAt as BusinessDate | null) ?? null,
    paidGrossAmount: row.paidGrossAmount ? String(row.paidGrossAmount) : null,
    dueDate: (row.dueDate as BusinessDate | null) ?? null,
  }));

  const currency = expensesList[0]?.currency ?? context.organization.baseCurrency;
  let recognizedNet = 0;
  let paidGross = 0;
  let outstandingGross = 0;

  const projectAgg = new Map<string, VendorDerivedProject>();

  for (const row of expensesList) {
    if (row.status !== 'finalized') continue;
    const net = Number(row.netAmount);
    const gross = Number(row.grossAmount);
    recognizedNet += net;

    if (row.paymentStatus === 'paid' && row.paidGrossAmount) {
      paidGross += Number(row.paidGrossAmount);
    } else if (row.paymentStatus !== 'paid') {
      outstandingGross += gross;
    }

    if (row.projectId && row.projectName) {
      const existing = projectAgg.get(row.projectId);
      if (existing) {
        projectAgg.set(row.projectId, {
          ...existing,
          expenseCount: existing.expenseCount + 1,
          recognizedNet: String(Number(existing.recognizedNet) + net),
          paidGross: String(
            Number(existing.paidGross) +
              (row.paymentStatus === 'paid' && row.paidGrossAmount ? Number(row.paidGrossAmount) : 0),
          ),
        });
      } else {
        projectAgg.set(row.projectId, {
          id: row.projectId,
          name: row.projectName,
          expenseCount: 1,
          recognizedNet: String(net),
          paidGross: String(
            row.paymentStatus === 'paid' && row.paidGrossAmount ? Number(row.paidGrossAmount) : 0,
          ),
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
      expenseCount: expensesList.filter((row) => row.status === 'finalized').length,
    },
  };
}
