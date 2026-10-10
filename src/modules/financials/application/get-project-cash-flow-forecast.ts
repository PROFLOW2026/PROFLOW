import type { OrgContext } from '@/shared/auth/context';
import { addDays, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { NotFoundError } from '@/shared/errors';
import { isPositiveMoney, isZeroMoney, money } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  computeRemaining,
  listExpectedProgressBillingLines,
  sumIssuedAmountsByPlanLine,
} from '@/modules/billing-plan';
import {
  computeBillOutstanding,
  getVendorPaymentsRepository,
  isRecognizedVendorBillStatus,
  listActiveCreditAmountsForBills,
  listApBills,
} from '@/modules/ap';
import { listActiveClaimCashProjectionsForOrg } from '@/modules/connected-projects';
import { loadCashFlowOpenBillingRows, loadCashFlowPayments } from '../data/billing.repository';
import type { CashFlowOpenBillingRow } from '../data/billing.repository';
import {
  loadOpenCommitmentCashRows,
  loadOperatingExpenseCashRows,
  loadPayrollObligationCashRows,
} from '../data/cash-flow-sources.repository';
import { assertProjectInOrg, findProjectCurrency } from '../data/projects.repository';
import {
  openCommitmentCashItems,
  operatingExpenseCashItems,
  payrollObligationCashItems,
} from '../domain/cash-flow-sources';
import {
  buildCashFlowOutlook,
  CASH_FLOW_HORIZON_DAYS,
  type ApBillCashInput,
  type CashFlowOutlook,
} from '../domain/cash-flow';
import {
  buildCashFlowForecast,
  certaintyForDatedSource,
  type CashFlowForecast,
  type CashFlowForecastItem,
  type CashFlowSourceType,
} from '../domain/cash-flow-forecast';
import { connectedClaimProjectionCashItems } from '../domain/connected-claim-cash-flow';

function mapApBillsForCash(
  rows: Awaited<ReturnType<typeof listApBills>>,
  appliedByBillId: ReadonlyMap<string, string[]>,
  creditsByBillId: ReadonlyMap<string, string[]>,
  currency: string,
  projectId: string,
): ApBillCashInput[] {
  const mapped: ApBillCashInput[] = [];
  for (const row of rows) {
    if (row.projectId !== projectId) continue;
    if (!isRecognizedVendorBillStatus(row.status)) continue;
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const outstanding = computeBillOutstanding({
      billStatus: row.status,
      billTotal: money(row.totalAmount, row.currency),
      applications: (appliedByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        paymentStatus: 'recorded' as const,
      })),
      creditApplications: (creditsByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        status: 'applied' as const,
      })),
      retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
    });
    if (!isPositiveMoney(outstanding)) continue;
    mapped.push({
      id: row.id,
      reference: row.reference,
      projectId: row.projectId,
      subcontractAgreementId: row.subcontractAgreementId ?? null,
      status: row.status,
      dueDate: (row.dueDate as BusinessDate | null) ?? null,
      totalAmount: outstanding,
    });
  }
  return mapped;
}

function billingLabel(record: CashFlowOpenBillingRow): string {
  return record.reference?.trim() || record.id;
}

function billingSourceType(record: CashFlowOpenBillingRow): CashFlowSourceType {
  if (record.kind === 'retention_release') return 'retention_release_in';
  return 'issued_billing';
}

function incomingFromBilling(
  records: readonly CashFlowOpenBillingRow[],
  currency: string,
  projectId: string,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const record of records) {
    if (record.projectId !== projectId) continue;
    if (record.outstandingNet.currency !== currency) continue;
    if (isZeroMoney(record.outstandingNet)) continue;
    items.push({
      id: `billing:${record.id}`,
      href: `/billing/${record.id}`,
      label: billingLabel(record),
      amount: record.outstandingNet,
      dueDate: record.dueDate,
      certainty: certaintyForDatedSource({
        dueDate: record.dueDate,
        recorded: true,
      }),
      direction: 'in',
      sourceType: billingSourceType(record),
      projectId: record.projectId,
    });
  }
  return items;
}

function outgoingFromApBills(
  bills: readonly ApBillCashInput[],
  currency: string,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const bill of bills) {
    if (bill.totalAmount.currency !== currency) continue;
    const id = bill.id ?? `ap:${bill.reference ?? 'undated'}`;
    items.push({
      id: `ap:${id}`,
      href: `/procurement/ap/${id}`,
      label: bill.reference?.trim() || id,
      amount: bill.totalAmount,
      dueDate: bill.dueDate,
      certainty: certaintyForDatedSource({ dueDate: bill.dueDate, recorded: true }),
      direction: 'out',
      sourceType: bill.subcontractAgreementId ? 'subcontractor_liability' : 'vendor_bill',
      projectId: bill.projectId ?? null,
    });
  }
  return items;
}

/**
 * Project-scoped cash forecast (v2 drilldown). Adds connected certified-claim receipt projections
 * for contractor org projects linked to a developer engagement.
 */
export async function getProjectCashFlowForecast(
  context: OrgContext,
  projectId: string,
): Promise<CashFlowForecast> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const exists = await assertProjectInOrg(context.db, context.organizationId, projectId);
  if (!exists) throw new NotFoundError('Project');

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = await findProjectCurrency(
    context.db,
    context.organizationId,
    projectId,
    context.organization.baseCurrency,
  );
  const showInflows = hasPermission(context, PERMISSIONS.BILLING_READ);
  const showAp = hasPermission(context, PERMISSIONS.AP_READ);
  const showOutflows = true;
  const [records, paymentRows, apBundle, progressLines, expenseRows, payrollRows, commitmentRows, connectedClaimRows] =
    await Promise.all([
      showInflows
        ? loadCashFlowOpenBillingRows(context.db, context.organizationId, currency).then((rows) =>
            rows.filter((row) => row.projectId === projectId),
          )
        : Promise.resolve([] as CashFlowOpenBillingRow[]),
      showInflows
        ? loadCashFlowPayments(context.db, context.organizationId, { projectId })
        : Promise.resolve([] as Awaited<ReturnType<typeof loadCashFlowPayments>>),
      showAp
        ? listApBills(context.db, context.organizationId, {
            limit: ORG_LIST_EXPORT_CAP,
          }).then(async (apRows) => {
            const projectBills = apRows.filter((row) => row.projectId === projectId);
            const billIds = projectBills.map((row) => row.id);
            const [appliedByBillId, creditsByBillId] = await Promise.all([
              getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
                context.db,
                context.organizationId,
                billIds,
              ),
              listActiveCreditAmountsForBills(context.db, context.organizationId, billIds),
            ]);
            return { apRows: projectBills, appliedByBillId, creditsByBillId };
          })
        : Promise.resolve(null),
      showInflows
        ? listExpectedProgressBillingLines(
            context.db,
            context.organizationId,
            asOf,
            addDays(asOf, CASH_FLOW_HORIZON_DAYS),
          )
            .then((rows) => rows.filter((row) => row.projectId === projectId))
            .catch(() => [] as Awaited<ReturnType<typeof listExpectedProgressBillingLines>>)
        : Promise.resolve([] as Awaited<ReturnType<typeof listExpectedProgressBillingLines>>),
      loadOperatingExpenseCashRows(context.db, context.organizationId, currency).then((rows) =>
        rows.filter((row) => row.projectId === projectId),
      ),
      loadPayrollObligationCashRows(context.db, context.organizationId, currency),
      showAp
        ? loadOpenCommitmentCashRows(context.db, context.organizationId, currency).then((rows) =>
            rows.filter((row) => row.projectId === projectId),
          )
        : Promise.resolve([] as Awaited<ReturnType<typeof loadOpenCommitmentCashRows>>),
      showInflows
        ? listActiveClaimCashProjectionsForOrg(context.db, context.organizationId, {
            contractorProjectId: projectId,
            currency,
          })
        : Promise.resolve([]),
    ]);

  const outstandingRecords = records.map((record) => ({
    outstandingAmount: record.outstandingNet,
    dueDate: record.dueDate,
  }));
  const payments = paymentRows.filter((row) => row.amount.currency === currency);
  const openApBills = apBundle
    ? mapApBillsForCash(
        apBundle.apRows,
        apBundle.appliedByBillId,
        apBundle.creditsByBillId,
        currency,
        projectId,
      )
    : undefined;

  const outlook: CashFlowOutlook = buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords: showInflows ? outstandingRecords : [],
    payments: showInflows ? payments : [],
    openApBills: showAp ? openApBills : undefined,
  });

  const progressItems: CashFlowForecastItem[] = [];
  if (showInflows) {
    const billedByPlan = new Map<string, Map<string, { amount: string; percent: string }>>();
    for (const row of progressLines) {
      if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
      let billed = billedByPlan.get(row.planId);
      if (!billed) {
        billed = await sumIssuedAmountsByPlanLine(context.db, context.organizationId, row.planId);
        billedByPlan.set(row.planId, billed);
      }
      const base = money(row.agreedAmount, currency);
      const prior = money(billed.get(row.lineId)?.amount ?? '0', currency);
      const remaining = computeRemaining(base, prior);
      if (!isPositiveMoney(remaining)) continue;
      progressItems.push({
        id: `billing-plan-line:${row.lineId}`,
        href: `/projects/${row.projectId}?tab=billingPlan`,
        label: `${row.projectName} · ${row.label}`,
        amount: remaining,
        dueDate: row.targetDate,
        certainty: 'expected',
        direction: 'in',
        sourceType: 'expected_progress_billing',
        projectId: row.projectId,
      });
    }
  }

  const items: CashFlowForecastItem[] = [
    ...(showInflows ? incomingFromBilling(records, currency, projectId) : []),
    ...(showAp && openApBills ? outgoingFromApBills(openApBills, currency) : []),
    ...progressItems,
    ...operatingExpenseCashItems(expenseRows, currency, asOf),
    ...payrollObligationCashItems(payrollRows, currency),
    ...openCommitmentCashItems(commitmentRows, currency),
    ...(showInflows ? connectedClaimProjectionCashItems(connectedClaimRows, currency) : []),
  ];

  return buildCashFlowForecast({
    outlook,
    items,
    showInflows,
    showOutflows,
  });
}
