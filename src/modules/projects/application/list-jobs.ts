import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { billingRecords, payments, projects } from '@drizzle/schema';
import { loadProjectFinancialsBatch } from '@/modules/financials/application/load-project-financials-batch';
import type { BillingPosition } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { fromNumericString, zeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { JobBillingPaymentStatus, JobListItem } from '../domain/types';
import { listProjects } from '../data/projects.repository';
import { listJobsSchema } from '../validation/schemas';

function resolveBillingPaymentStatus(input: {
  readonly invoiced: string | null;
  readonly paid: string | null;
  readonly currency: string;
}): JobBillingPaymentStatus {
  if (!input.invoiced) return 'none';
  try {
    const invoiced = fromNumericString(input.invoiced, input.currency);
    if (!invoiced) return 'none';
    const paid =
      (input.paid ? fromNumericString(input.paid, input.currency) : null) ??
      zeroMoney(input.currency);
    if (Number(invoiced.amount) <= 0) return 'none';
    if (Number(paid.amount) <= 0) return 'unpaid';
    if (Number(paid.amount) + 1e-9 < Number(invoiced.amount)) return 'partial';
    return 'paid';
  } catch {
    return 'none';
  }
}

function resolveBillingPaymentStatusFromPosition(
  billing: BillingPosition,
): JobBillingPaymentStatus {
  return resolveBillingPaymentStatus({
    invoiced: billing.invoiced.amount,
    paid: billing.paid.amount,
    currency: billing.invoiced.currency,
  });
}

/**
 * Lists `work_kind=job` rows with price / actual cost / profit / billing status
 * for the jobs list page.
 *
 * Actual cost and profit prefer the shared financial compose batch (same path as
 * org rollup) so labor / overhead / AP recognition stay consistent with project
 * financials — not an expense-net-only approximation.
 */
export async function listJobsForOrg(
  context: OrgContext,
  rawFilters: Record<string, unknown> = {},
): Promise<JobListItem[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const parsed = listJobsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const rows = await listProjects(context.db, context.organizationId, {
    ...parsed.data,
    workKind: 'job',
  });

  if (rows.length === 0) return [];

  const jobIds = rows.map((row) => row.id);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canShowActual =
    canReadFinancials ||
    canReadExpenses ||
    hasPermission(context, PERMISSIONS.WORKFORCE_READ) ||
    hasPermission(context, PERMISSIONS.AP_READ);

  const forecastMetaRows = await context.db
    .select({
      id: projects.id,
      currency: projects.currency,
      expectedRemainingCostAmount: projects.expectedRemainingCostAmount,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
    })
    .from(projects)
    .where(
      and(eq(projects.organizationId, context.organizationId), inArray(projects.id, jobIds)),
    );

  const forecastByProject = new Map(
    forecastMetaRows.map((meta) => [
      meta.id,
      {
        currency:
          meta.currency ??
          rows.find((row) => row.id === meta.id)?.contractCurrency ??
          context.organization.baseCurrency,
        expectedRemainingCostAmount: meta.expectedRemainingCostAmount,
        workKind: meta.workKind,
        pricingMode: meta.pricingMode,
      },
    ]),
  );

  // Fill any list rows missing from the meta select (should not happen).
  for (const row of rows) {
    if (!forecastByProject.has(row.id)) {
      forecastByProject.set(row.id, {
        currency: row.contractCurrency ?? row.currency ?? context.organization.baseCurrency,
        expectedRemainingCostAmount: null,
        workKind: row.workKind,
        pricingMode: row.pricingMode,
      });
    }
  }

  const [financialsByJob, invoiceRows, paymentRows] = await Promise.all([
    loadProjectFinancialsBatch(context, jobIds, forecastByProject),
    // Billing status stays a light set-based query when financials permission is absent
    // but billing is readable; otherwise compose billing is preferred below.
    canReadBilling && !canReadFinancials
      ? context.db
          .select({
            projectId: billingRecords.projectId,
            invoiced: sql<string>`coalesce(sum(
              case
                when ${billingRecords.status} = 'finalized'
                  and ${billingRecords.kind} = 'credit_note'
                  then -${billingRecords.totalAmount}
                when ${billingRecords.status} = 'finalized'
                  then ${billingRecords.totalAmount}
                else 0
              end
            ), 0)::text`,
          })
          .from(billingRecords)
          .where(
            and(
              eq(billingRecords.organizationId, context.organizationId),
              isNull(billingRecords.archivedAt),
              inArray(billingRecords.projectId, jobIds),
            ),
          )
          .groupBy(billingRecords.projectId)
      : Promise.resolve([] as { projectId: string | null; invoiced: string }[]),
    canReadBilling && !canReadFinancials
      ? context.db
          .select({
            projectId: billingRecords.projectId,
            paid: sql<string>`coalesce(sum(
              case when ${payments.status} = 'recorded' then ${payments.amount} else 0 end
            ), 0)::text`,
          })
          .from(payments)
          .innerJoin(billingRecords, eq(payments.billingRecordId, billingRecords.id))
          .where(
            and(
              eq(payments.organizationId, context.organizationId),
              isNull(billingRecords.archivedAt),
              inArray(billingRecords.projectId, jobIds),
            ),
          )
          .groupBy(billingRecords.projectId)
      : Promise.resolve([] as { projectId: string | null; paid: string }[]),
  ]);

  const invoicedByJob = new Map(
    invoiceRows
      .filter((row): row is { projectId: string; invoiced: string } => Boolean(row.projectId))
      .map((row) => [row.projectId, row.invoiced]),
  );
  const paidByJob = new Map(
    paymentRows
      .filter((row): row is { projectId: string; paid: string } => Boolean(row.projectId))
      .map((row) => [row.projectId, row.paid]),
  );

  return rows.map((row) => {
    const currency =
      row.contractCurrency ?? row.currency ?? context.organization.baseCurrency;
    const financials = financialsByJob.get(row.id);

    const actualCostAmount =
      canShowActual && financials
        ? financials.cost.actualCostToDate.amount
        : null;

    const profitDefined = Boolean(
      canReadProfit && financials && !financials.priceNotSet && financials.profit,
    );
    const profitAmount =
      profitDefined && financials?.profit ? financials.profit.actualProfit.amount : null;

    let billingPaymentStatus: JobBillingPaymentStatus = 'none';
    let invoicedAmount: string | null = null;
    let paidAmount: string | null = null;

    if (canReadBilling) {
      if (financials && canReadFinancials) {
        billingPaymentStatus = resolveBillingPaymentStatusFromPosition(financials.billing);
        invoicedAmount = financials.billing.invoiced.amount;
        paidAmount = financials.billing.paid.amount;
      } else {
        invoicedAmount = invoicedByJob.get(row.id) ?? null;
        paidAmount = paidByJob.get(row.id) ?? null;
        billingPaymentStatus = resolveBillingPaymentStatus({
          invoiced: invoicedAmount,
          paid: paidAmount,
          currency,
        });
      }
    }

    return {
      ...row,
      actualCostAmount,
      profitAmount,
      profitDefined,
      billingPaymentStatus,
      invoicedAmount,
      paidAmount,
    };
  });
}
