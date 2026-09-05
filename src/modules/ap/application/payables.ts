/**
 * Org / vendor / project AP payable rollups (cash outstanding + aging).
 * Never folds payments into Actual Cost.
 */

import type { OrgContext } from '@/shared/auth/context';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { addMoney, isZeroMoney, money, zeroMoney } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listApBills } from '../data/ap.repository';
import { listActiveCreditAmountsForBills } from '../data/credits.repository';
import { getVendorPaymentsRepository } from '../data/payments.repository';
import {
  computePayablesAging,
  type ApAgingBillInput,
  type PayablesAging,
} from '../domain/payables-aging';
import {
  aggregateVendorOutstanding,
  areApPaymentsAvailable,
  type ApPayableStatus,
  computeBillOutstanding,
  derivePayableStatus,
  sumActiveAppliedAmounts,
} from '../domain/vendor-payments';

export interface BillPayableSummary {
  readonly billId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly projectId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly reference: string | null;
  readonly billStatus: string;
  readonly dueDate: BusinessDate | null;
  readonly currency: string;
  readonly billTotal: string;
  readonly paid: string;
  readonly credited: string;
  readonly outstanding: string;
  readonly retentionAmount: string;
  readonly retentionHeldRemaining: string;
  readonly payableStatus: ApPayableStatus | null;
}

export interface OrgApPayablesSummary {
  readonly currency: string;
  readonly paymentsAvailable: boolean;
  readonly billed: string;
  readonly paid: string;
  readonly outstanding: string;
  readonly retentionHeld: string;
  readonly unpaidCount: number;
  readonly partialCount: number;
  readonly paidCount: number;
  readonly bills: readonly BillPayableSummary[];
  readonly note: string;
}

export function billMatchesPayablesFilters(
  bill: { readonly vendorId: string; readonly projectId: string | null },
  filters: { readonly vendorId?: string; readonly projectId?: string | null },
): boolean {
  if (filters.vendorId && bill.vendorId !== filters.vendorId) return false;
  if (filters.projectId !== undefined && bill.projectId !== filters.projectId) return false;
  return true;
}

function toAggregateBills(bills: readonly BillPayableSummary[]) {
  return bills.map((bill) => {
    const paid = money(bill.paid, bill.currency);
    const credited = money(bill.credited, bill.currency);
    return {
      billStatus: bill.billStatus,
      billTotal: money(bill.billTotal, bill.currency),
      applications: isZeroMoney(paid)
        ? []
        : [{ appliedAmount: paid, paymentStatus: 'recorded' as const }],
      creditApplications: isZeroMoney(credited)
        ? []
        : [{ appliedAmount: credited, status: 'applied' as const }],
      retentionHeldRemaining: money(bill.retentionHeldRemaining, bill.currency),
    };
  });
}

function toSummary(
  currency: string,
  bills: readonly BillPayableSummary[],
  note: string,
): OrgApPayablesSummary {
  const aggregate = aggregateVendorOutstanding({
    currency,
    bills: toAggregateBills(bills),
  });
  const retentionHeld = bills.reduce(
    (sum, bill) => addMoney(sum, money(bill.retentionHeldRemaining, bill.currency)),
    zeroMoney(currency),
  );
  return {
    currency,
    paymentsAvailable: areApPaymentsAvailable(),
    billed: aggregate.billed.amount,
    paid: aggregate.paid.amount,
    outstanding: aggregate.outstanding.amount,
    retentionHeld: retentionHeld.amount,
    unpaidCount: aggregate.unpaidCount,
    partialCount: aggregate.partialCount,
    paidCount: aggregate.paidCount,
    bills,
    note,
  };
}

async function loadPayableBills(
  context: OrgContext,
  options: {
    readonly vendorId?: string;
    readonly projectId?: string | null;
    readonly subcontractAgreementId?: string;
    readonly currency: string;
  },
): Promise<BillPayableSummary[]> {
  const bills = await listApBills(context.db, context.organizationId, { limit: 500 });
  const filtered = bills.filter((bill) => {
    if (!billMatchesPayablesFilters(bill, options)) return false;
    if (
      options.subcontractAgreementId &&
      bill.subcontractAgreementId !== options.subcontractAgreementId
    ) {
      return false;
    }
    if (bill.currency.toUpperCase() !== options.currency.toUpperCase()) return false;
    return true;
  });

  const repo = getVendorPaymentsRepository();
  const billIds = filtered.map((b) => b.id);
  const [appliedByBill, creditsByBill] = await Promise.all([
    repo.listActiveAppliedAmountsForBills(context.db, context.organizationId, billIds),
    listActiveCreditAmountsForBills(context.db, context.organizationId, billIds),
  ]);

  return filtered.map((bill) => {
    const applied = appliedByBill.get(bill.id) ?? [];
    const credits = creditsByBill.get(bill.id) ?? [];
    const billTotal = money(bill.totalAmount, bill.currency);
    const applications = applied.map((amount) => ({
      appliedAmount: money(amount, bill.currency),
      paymentStatus: 'recorded' as const,
    }));
    const creditApplications = credits.map((amount) => ({
      appliedAmount: money(amount, bill.currency),
      status: 'applied' as const,
    }));
    const retentionHeldRemaining = money(bill.retentionHeldRemaining, bill.currency);
    const outstanding = computeBillOutstanding({
      billStatus: bill.status,
      billTotal,
      applications,
      creditApplications,
      retentionHeldRemaining,
    });
    const creditedTotal = credits.reduce(
      (sum, amount) => addMoney(sum, money(amount, bill.currency)),
      money('0', bill.currency),
    );
    const paidCash = sumActiveAppliedAmounts(applications, bill.currency);

    return {
      billId: bill.id,
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      projectId: bill.projectId,
      subcontractAgreementId: bill.subcontractAgreementId,
      reference: bill.reference,
      billStatus: bill.status,
      dueDate: (bill.dueDate as BusinessDate | null) ?? null,
      currency: bill.currency,
      billTotal: bill.totalAmount,
      paid: paidCash.amount,
      credited: creditedTotal.amount,
      outstanding: outstanding.amount,
      retentionAmount: bill.retentionAmount,
      retentionHeldRemaining: bill.retentionHeldRemaining,
      payableStatus: derivePayableStatus({
        billStatus: bill.status,
        billTotal,
        applications,
        creditApplications,
        retentionHeldRemaining,
      }),
    };
  });
}

export async function getOrganizationApPayables(
  context: OrgContext,
  options: { readonly currency?: string } = {},
): Promise<OrgApPayablesSummary> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const currency = (options.currency ?? context.organization.baseCurrency).toUpperCase();
  const bills = await loadPayableBills(context, { currency });
  return toSummary(
    currency,
    bills,
    'AP outstanding is cash only (bill − payments). Vendor payments never increase Actual Cost.',
  );
}

export async function getVendorApOutstanding(
  context: OrgContext,
  vendorId: string,
  options: { readonly currency?: string; readonly subcontractAgreementId?: string } = {},
): Promise<OrgApPayablesSummary> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const currency = (options.currency ?? context.organization.baseCurrency).toUpperCase();
  const bills = await loadPayableBills(context, {
    vendorId,
    currency,
    subcontractAgreementId: options.subcontractAgreementId,
  });
  return toSummary(
    currency,
    bills,
    options.subcontractAgreementId
      ? 'Subcontract AP outstanding is cash only for this agreement. Payments do not affect Actual Cost.'
      : 'Vendor AP outstanding is cash only. Payments do not affect Actual Cost.',
  );
}

export async function getProjectApOutstanding(
  context: OrgContext,
  projectId: string,
  options: { readonly currency?: string } = {},
): Promise<OrgApPayablesSummary> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const currency = (options.currency ?? context.organization.baseCurrency).toUpperCase();
  const bills = await loadPayableBills(context, { projectId, currency });
  return toSummary(
    currency,
    bills,
    'Project AP outstanding follows bill.projectId. Cash only - not Actual Cost.',
  );
}

function agingFromBills(
  bills: readonly BillPayableSummary[],
  currency: string,
  asOf: BusinessDate,
): PayablesAging {
  const agingInputs: ApAgingBillInput[] = bills.map((bill) => {
    const paid = money(bill.paid, bill.currency);
    const credited = money(bill.credited, bill.currency);
    return {
      billStatus: bill.billStatus,
      billTotal: money(bill.billTotal, bill.currency),
      dueDate: bill.dueDate,
      projectId: bill.projectId,
      vendorId: bill.vendorId,
      applications: isZeroMoney(paid)
        ? []
        : [{ appliedAmount: paid, paymentStatus: 'recorded' as const }],
      creditApplications: isZeroMoney(credited)
        ? []
        : [{ appliedAmount: credited, status: 'applied' as const }],
      retentionHeldRemaining: money(bill.retentionHeldRemaining, bill.currency),
    };
  });
  return computePayablesAging(agingInputs, currency, asOf);
}

export async function getOrganizationPayablesAging(
  context: OrgContext,
  options: {
    readonly currency?: string;
    readonly asOf?: BusinessDate;
    readonly vendorId?: string;
    readonly projectId?: string;
  } = {},
): Promise<PayablesAging> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const currency = (options.currency ?? context.organization.baseCurrency).toUpperCase();
  const asOf = options.asOf ?? businessDate(new Date().toISOString().slice(0, 10));
  const bills = await loadPayableBills(context, {
    currency,
    vendorId: options.vendorId,
    projectId: options.projectId,
  });
  return agingFromBills(bills, currency, asOf);
}

export async function getVendorPayablesAging(
  context: OrgContext,
  vendorId: string,
  options: {
    readonly currency?: string;
    readonly asOf?: BusinessDate;
    readonly subcontractAgreementId?: string;
  } = {},
): Promise<PayablesAging> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const currency = (options.currency ?? context.organization.baseCurrency).toUpperCase();
  const asOf = options.asOf ?? businessDate(new Date().toISOString().slice(0, 10));
  const bills = await loadPayableBills(context, {
    vendorId,
    currency,
    subcontractAgreementId: options.subcontractAgreementId,
  });
  return agingFromBills(bills, currency, asOf);
}
