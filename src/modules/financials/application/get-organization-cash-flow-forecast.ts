import type { OrgContext } from '@/shared/auth/context';
import { addDays, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { isPositiveMoney, isZeroMoney, money, type MoneyValue } from '@/shared/money';
import { assertPermission, hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
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
import {
  ANY_DRAFT_ACCESS_PERMISSIONS,
  listRecurringDraftsForOrg,
  type RecurringFinancialDraftRecord,
} from '@/modules/recurring-drafts';
import { loadCashFlowOpenBillingRows, loadCashFlowPayments } from '../data/billing.repository';
import type { CashFlowOpenBillingRow } from '../data/billing.repository';
import {
  loadOpenCommitmentCashRows,
  loadOperatingExpenseCashRows,
  loadPayrollObligationCashRows,
} from '../data/cash-flow-sources.repository';
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

function mapApBillsForCash(
  rows: Awaited<ReturnType<typeof listApBills>>,
  appliedByBillId: ReadonlyMap<string, string[]>,
  creditsByBillId: ReadonlyMap<string, string[]>,
  currency: string,
): ApBillCashInput[] {
  const mapped: ApBillCashInput[] = [];
  for (const row of rows) {
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
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const record of records) {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalDueDays(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    const parsed = Number(value);
    return parsed >= 0 ? Math.trunc(parsed) : null;
  }
  return null;
}

function draftCashFields(
  draft: RecurringFinancialDraftRecord,
  fallbackCurrency: string,
): {
  readonly amount: MoneyValue;
  readonly dueDate: BusinessDate;
  readonly projectId: string | null;
} | null {
  const data = asRecord(draft.payloadJson);
  if (!data) return null;

  const currency = (optionalString(data.currency) ?? fallbackCurrency).toUpperCase();
  const amountRaw =
    draft.draftKind === 'vendor_bill'
      ? optionalString(data.totalAmount)
      : optionalString(data.amount);
  if (!amountRaw) return null;

  let amount: MoneyValue;
  try {
    amount = money(amountRaw, currency);
  } catch {
    return null;
  }

  const dueDays = optionalDueDays(data.dueDays);
  const dueDate =
    dueDays == null ? draft.nextRunDate : addDays(draft.nextRunDate, dueDays);

  return {
    amount,
    dueDate,
    projectId: optionalString(data.projectId),
  };
}

function itemsFromRecurringDrafts(
  drafts: readonly RecurringFinancialDraftRecord[],
  currency: string,
  canIn: boolean,
  canOut: boolean,
  includeExpenseDrafts: boolean,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const draft of drafts) {
    if (draft.status !== 'active') continue;
    const fields = draftCashFields(draft, currency);
    if (!fields) continue;
    if (fields.amount.currency.toUpperCase() !== currency.toUpperCase()) continue;
    if (isZeroMoney(fields.amount)) continue;

    if (draft.draftKind === 'expense') {
      if (!includeExpenseDrafts) continue;
      items.push({
        id: `draft:${draft.id}`,
        href: `/recurring-drafts/${draft.id}`,
        label: draft.title,
        amount: fields.amount,
        dueDate: fields.dueDate,
        certainty: 'expected',
        direction: 'out',
        sourceType: 'recurring_draft',
        projectId: fields.projectId,
      });
      continue;
    }

    if (draft.draftKind === 'billing_record') {
      if (!canIn) continue;
      items.push({
        id: `draft:${draft.id}`,
        href: `/recurring-drafts/${draft.id}`,
        label: draft.title,
        amount: fields.amount,
        dueDate: fields.dueDate,
        certainty: 'expected',
        direction: 'in',
        sourceType: 'recurring_draft',
        projectId: fields.projectId,
      });
      continue;
    }

    if (draft.draftKind === 'vendor_bill') {
      if (!canOut) continue;
      items.push({
        id: `draft:${draft.id}`,
        href: `/recurring-drafts/${draft.id}`,
        label: draft.title,
        amount: fields.amount,
        dueDate: fields.dueDate,
        certainty: 'expected',
        direction: 'out',
        sourceType: 'recurring_draft',
        projectId: fields.projectId,
      });
    }
  }
  return items;
}

/**
 * Planned (not issued) progress-billing lines with target_date in the horizon.
 * Certainty is always `expected` — never confirmed until a cycle is issued.
 */
async function itemsFromExpectedProgressBilling(
  context: OrgContext,
  rows: Awaited<ReturnType<typeof listExpectedProgressBillingLines>>,
  currency: string,
): Promise<CashFlowForecastItem[]> {
  const items: CashFlowForecastItem[] = [];
  const billedByPlan = new Map<string, Map<string, { amount: string; percent: string }>>();

  for (const row of rows) {
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

    items.push({
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
  return items;
}

/**
 * Org cash forecast with drilldown. Cash, not profit.
 * Billing uses open-net SQL (no 5,000-row list). Payroll and operating expense
 * dues are cash outflows. Open PO commitments stay undated — they have no due date.
 * Dated retention releases come through billing kind `retention_release`. Held
 * retention is already netted inside open billing and AP cash outstanding.
 * Subcontractor cash is recognized AP linked to an agreement.
 */
export async function getOrganizationCashFlowForecast(
  context: OrgContext,
): Promise<CashFlowForecast> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = context.organization.baseCurrency;
  const showInflows = hasPermission(context, PERMISSIONS.BILLING_READ);
  const showAp = hasPermission(context, PERMISSIONS.AP_READ);
  const showOutflows = true;
  const canReadDrafts = hasAnyPermission(context, ANY_DRAFT_ACCESS_PERMISSIONS);

  const [records, paymentRows, apBundle, drafts, progressLines, expenseRows, payrollRows, commitmentRows] =
    await Promise.all([
    showInflows
      ? loadCashFlowOpenBillingRows(context.db, context.organizationId, currency)
      : Promise.resolve([] as CashFlowOpenBillingRow[]),
    showInflows
      ? loadCashFlowPayments(context.db, context.organizationId)
      : Promise.resolve([] as Awaited<ReturnType<typeof loadCashFlowPayments>>),
    showAp
      ? listApBills(context.db, context.organizationId, {
          limit: ORG_LIST_EXPORT_CAP,
        }).then(async (apRows) => {
          const billIds = apRows.map((row) => row.id);
          const [appliedByBillId, creditsByBillId] = await Promise.all([
            getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
              context.db,
              context.organizationId,
              billIds,
            ),
            listActiveCreditAmountsForBills(context.db, context.organizationId, billIds),
          ]);
          return { apRows, appliedByBillId, creditsByBillId };
        })
      : Promise.resolve(null),
    canReadDrafts
      ? listRecurringDraftsForOrg(context, { status: 'active' }).catch(
          () => [] as RecurringFinancialDraftRecord[],
        )
      : Promise.resolve([] as RecurringFinancialDraftRecord[]),
    showInflows
      ? listExpectedProgressBillingLines(
          context.db,
          context.organizationId,
          asOf,
          addDays(asOf, CASH_FLOW_HORIZON_DAYS),
        ).catch(() => [] as Awaited<ReturnType<typeof listExpectedProgressBillingLines>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof listExpectedProgressBillingLines>>),
    loadOperatingExpenseCashRows(context.db, context.organizationId, currency),
    loadPayrollObligationCashRows(context.db, context.organizationId, currency),
    showAp
      ? loadOpenCommitmentCashRows(context.db, context.organizationId, currency)
      : Promise.resolve([] as Awaited<ReturnType<typeof loadOpenCommitmentCashRows>>),
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
      )
    : undefined;

  const outlook: CashFlowOutlook = buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords: showInflows ? outstandingRecords : [],
    payments: showInflows ? payments : [],
    openApBills: showAp ? openApBills : undefined,
  });

  const progressItems = showInflows
    ? await itemsFromExpectedProgressBilling(context, progressLines, currency)
    : [];

  const items: CashFlowForecastItem[] = [
    ...(showInflows ? incomingFromBilling(records, currency) : []),
    ...(showAp && openApBills ? outgoingFromApBills(openApBills, currency) : []),
    ...itemsFromRecurringDrafts(drafts, currency, showInflows, showAp, true),
    ...progressItems,
    ...operatingExpenseCashItems(expenseRows, currency, asOf),
    ...payrollObligationCashItems(payrollRows, currency),
    ...openCommitmentCashItems(commitmentRows, currency),
  ];

  return buildCashFlowForecast({
    outlook,
    items,
    showInflows,
    showOutflows,
  });
}
