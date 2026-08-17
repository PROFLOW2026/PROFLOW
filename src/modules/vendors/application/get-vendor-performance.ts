import { and, eq, inArray, isNull } from 'drizzle-orm';
import { poReceipts, warrantyCoverages, warrantyIssues } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, daysBetween } from '@/shared/dates';
import { addMoney, money, zeroMoney, type MoneyValue } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  computeMatchVariance,
  getVendorApOutstanding,
  isRecognizedVendorBillStatus,
  listAcceptedMatchAmountsForBills,
  listVendorPaymentsForVendor,
} from '@/modules/ap';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { listPurchaseOrdersForOrg } from '@/modules/procurement';
import { getVendorById } from './list-vendors';
import { listVendorEngagementHistory } from './manage-engagements';
import { listVendorSubcontracts } from './subcontracts';
import {
  buildSupplierPerformance,
  moneyOrNull,
  type SupplierBillDiscrepancy,
  type SupplierComplianceSnapshot,
  type SupplierFulfillmentLag,
  type SupplierPerformance,
  type SupplierSubcontractSnapshot,
  type SupplierWarrantyQuality,
} from '../domain/supplier-performance';

function addSameCurrency(left: MoneyValue, right: MoneyValue): MoneyValue {
  if (left.currency.toUpperCase() !== right.currency.toUpperCase()) return left;
  return addMoney(left, right);
}

async function loadFulfillmentLag(
  context: OrgContext,
  vendorId: string,
): Promise<{
  readonly poCount: number;
  readonly poCommitted: MoneyValue;
  readonly lag: SupplierFulfillmentLag | null;
}> {
  const currency = context.organization.baseCurrency;
  const orders = (await listPurchaseOrdersForOrg(context)).filter(
    (order) => order.vendorId === vendorId && !order.archivedAt,
  );

  const issued = orders.filter(
    (order) =>
      order.status === 'issued' ||
      order.status === 'partially_received' ||
      order.status === 'closed',
  );

  let poCommitted = zeroMoney(currency);
  for (const order of issued) {
    if (order.currency.toUpperCase() !== currency.toUpperCase()) continue;
    poCommitted = addSameCurrency(poCommitted, money(order.committedAmount, order.currency));
  }

  const orderIds = issued.map((order) => order.id);
  if (orderIds.length === 0) {
    return { poCount: issued.length, poCommitted, lag: null };
  }

  const receipts = await context.db
    .select({
      purchaseOrderId: poReceipts.purchaseOrderId,
      receivedOn: poReceipts.receivedOn,
    })
    .from(poReceipts)
    .where(
      and(
        eq(poReceipts.organizationId, context.organizationId),
        inArray(poReceipts.purchaseOrderId, orderIds),
      ),
    );

  const firstReceipt = new Map<string, string>();
  for (const receipt of receipts) {
    const current = firstReceipt.get(receipt.purchaseOrderId);
    if (!current || receipt.receivedOn < current) {
      firstReceipt.set(receipt.purchaseOrderId, receipt.receivedOn);
    }
  }

  const lags: number[] = [];
  for (const order of issued) {
    if (!order.orderedOn) continue;
    const receivedOn = firstReceipt.get(order.id);
    if (!receivedOn) continue;
    lags.push(daysBetween(businessDate(order.orderedOn), businessDate(receivedOn)));
  }

  return {
    poCount: issued.length,
    poCommitted,
    lag:
      lags.length === 0
        ? null
        : {
            sampleSize: lags.length,
            averageDays:
              Math.round((lags.reduce((sum, days) => sum + days, 0) / lags.length) * 10) / 10,
          },
  };
}

async function loadWarrantyQuality(
  context: OrgContext,
  vendorId: string,
): Promise<SupplierWarrantyQuality | null> {
  try {
    const coverages = await context.db
      .select({ id: warrantyCoverages.id })
      .from(warrantyCoverages)
      .where(
        and(
          eq(warrantyCoverages.organizationId, context.organizationId),
          eq(warrantyCoverages.vendorId, vendorId),
          isNull(warrantyCoverages.archivedAt),
        ),
      );
    if (coverages.length === 0) return null;
    const coverageIds = coverages.map((row) => row.id);
    const issues = await context.db
      .select({
        id: warrantyIssues.id,
        status: warrantyIssues.status,
      })
      .from(warrantyIssues)
      .where(
        and(
          eq(warrantyIssues.organizationId, context.organizationId),
          inArray(warrantyIssues.coverageId, coverageIds),
          isNull(warrantyIssues.archivedAt),
        ),
      );
    const openIssueCount = issues.filter(
      (issue) => issue.status === 'open' || issue.status === 'in_progress',
    ).length;
    return { coverageCount: coverages.length, openIssueCount };
  } catch {
    return null;
  }
}

async function loadBillDiscrepancy(
  context: OrgContext,
  bills: readonly { id: string; totalAmount: string; currency: string; status: string }[],
): Promise<SupplierBillDiscrepancy | null> {
  const billIds = bills.map((bill) => bill.id);
  if (billIds.length === 0) return null;
  const matchedByBill = await listAcceptedMatchAmountsForBills(
    context.db,
    context.organizationId,
    billIds,
  );
  let matchedBillCount = 0;
  let discrepancyCount = 0;
  for (const bill of bills) {
    if (!isRecognizedVendorBillStatus(bill.status)) continue;
    const accepted = matchedByBill.get(bill.id) ?? [];
    if (accepted.length === 0) continue;
    matchedBillCount += 1;
    const variance = computeMatchVariance({
      currency: bill.currency,
      billTotal: bill.totalAmount,
      acceptedMatchedAmounts: accepted,
    });
    if (variance.hasOverMatchVariance) discrepancyCount += 1;
  }
  if (matchedBillCount === 0) return null;
  return { matchedBillCount, discrepancyCount };
}

/**
 * Recorded supplier performance for vendor 360. Missing data stays uncovered.
 */
export async function getVendorPerformance(
  context: OrgContext,
  vendorId: string,
): Promise<SupplierPerformance> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const vendor = await getVendorById(context, vendorId);
  const currency = context.organization.baseCurrency;
  const canAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canProcurement = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canCompliance = hasPermission(context, PERMISSIONS.COMPLIANCE_READ);

  const [history, subcontracts, ap, payments, procurement, warrantyQuality, complianceRows] =
    await Promise.all([
      listVendorEngagementHistory(context, vendorId).catch(() => []),
      listVendorSubcontracts(context, vendorId).catch(() => []),
      canAp ? getVendorApOutstanding(context, vendorId).catch(() => null) : Promise.resolve(null),
      canAp
        ? listVendorPaymentsForVendor(context, vendorId).catch(() => [])
        : Promise.resolve([]),
      canProcurement
        ? loadFulfillmentLag(context, vendorId).catch(() => null)
        : Promise.resolve(null),
      loadWarrantyQuality(context, vendorId),
      canCompliance
        ? listComplianceArtifactsForOrg(context, { subjectType: 'vendor' }).catch(() => [])
        : Promise.resolve([]),
    ]);

  const projectIds = new Set<string>();
  for (const engagement of vendor.engagements) projectIds.add(engagement.projectId);
  for (const engagement of history) projectIds.add(engagement.projectId);
  for (const agreement of subcontracts) projectIds.add(agreement.projectId);
  if (ap) {
    for (const bill of ap.bills) {
      if (bill.projectId) projectIds.add(bill.projectId);
    }
  }

  let totalPurchased = ap ? money(ap.billed, ap.currency) : null;
  if (totalPurchased && totalPurchased.currency.toUpperCase() !== currency.toUpperCase()) {
    totalPurchased = null;
  }
  let openLiabilities = ap ? money(ap.outstanding, ap.currency) : null;
  if (openLiabilities && openLiabilities.currency.toUpperCase() !== currency.toUpperCase()) {
    openLiabilities = null;
  }

  const billDiscrepancy =
    canAp && ap
      ? await loadBillDiscrepancy(
          context,
          ap.bills.map((bill) => ({
            id: bill.billId,
            totalAmount: bill.billTotal,
            currency: bill.currency,
            status: bill.billStatus,
          })),
        )
      : null;

  let subcontract: SupplierSubcontractSnapshot | null = null;
  if (subcontracts.length > 0) {
    let currentValue = zeroMoney(currency);
    let billed = zeroMoney(currency);
    let outstanding = zeroMoney(currency);
    for (const agreement of subcontracts) {
      if (agreement.currency.toUpperCase() !== currency.toUpperCase()) continue;
      currentValue = addSameCurrency(currentValue, money(agreement.currentAmount, agreement.currency));
      billed = addSameCurrency(billed, money(agreement.billedAmount, agreement.currency));
      outstanding = addSameCurrency(
        outstanding,
        money(agreement.outstandingAmount, agreement.currency),
      );
    }
    subcontract = {
      agreementCount: subcontracts.length,
      currentValue,
      billed,
      outstanding,
    };
  }

  const vendorArtifacts = complianceRows.filter((row) => row.subjectId === vendorId);
  let compliance: SupplierComplianceSnapshot | null = null;
  if (vendorArtifacts.length > 0) {
    const expiredOrRevokedCount = vendorArtifacts.filter(
      (row) => row.status === 'expired' || row.status === 'revoked',
    ).length;
    const validCount = vendorArtifacts.filter(
      (row) => row.status === 'valid' || row.status === 'expiring_soon',
    ).length;
    compliance = {
      artifactCount: vendorArtifacts.length,
      validCount,
      expiredOrRevokedCount,
    };
  }

  const recordedPayments = payments.filter((payment) => payment.status === 'recorded');
  const projectCount = projectIds.size > 0 ? projectIds.size : null;

  return buildSupplierPerformance({
    vendorId,
    currency,
    totalPurchased,
    openLiabilities,
    projectCount,
    poCount: procurement && procurement.poCount > 0 ? procurement.poCount : null,
    poCommitted: procurement ? moneyOrNull(procurement.poCommitted) : null,
    fulfillmentLag: procurement?.lag ?? null,
    billDiscrepancy,
    warrantyQuality,
    subcontract,
    compliance,
    payment: ap
      ? {
          billed: money(ap.billed, ap.currency),
          paid: money(ap.paid, ap.currency),
          outstanding: money(ap.outstanding, ap.currency),
          paymentCount: recordedPayments.length,
        }
      : null,
  });
}
