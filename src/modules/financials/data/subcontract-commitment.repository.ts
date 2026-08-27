import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  apBills,
  committedCosts,
  purchaseOrders,
  subcontractAgreements,
  subcontractValueEvents,
} from '@drizzle/schema';
import {
  listActiveCreditActualReductionsForBills,
  netProjectSliceAfterCredits,
  scaleBillSliceAfterCredits,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import { computeCurrentSubcontractValue } from '@/modules/vendors/domain/subcontract-value';
import type { SubcontractValueEventKind } from '@/modules/vendors/domain/subcontract-types';
import {
  sumSubcontractRemainingCommitment,
  type SubcontractAgreementCommitmentInput,
} from '@/modules/vendors/domain/subcontract-commitment';
import type { DbExecutor } from '@/shared/db/types';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

const OPEN_COMMITTED_STATUSES = ['open', 'partially_consumed'] as const;
const ACTIVE_SUBCONTRACT_STATUSES = ['active'] as const;

async function loadRecognizedActualByAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementIds: readonly string[],
  currency: string,
): Promise<Map<string, MoneyValue>> {
  const result = new Map<string, MoneyValue>();
  if (agreementIds.length === 0) return result;

  const normalized = currency.toUpperCase();
  const bills = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      subcontractAgreementId: apBills.subcontractAgreementId,
      netAmount: apBills.netAmount,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.subcontractAgreementId, [...agreementIds]),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const billIds = bills.map((row) => row.id);
  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    billIds,
  );

  for (const agreementId of agreementIds) {
    result.set(agreementId, zeroMoney(normalized));
  }

  for (const bill of bills) {
    if (!bill.subcontractAgreementId) continue;
    if (bill.currency.toUpperCase() !== normalized) continue;
    const net = bill.netAmount ?? bill.totalAmount;
    const netted = bill.projectId
      ? netProjectSliceAfterCredits({
          currency: normalized,
          billNetAmount: net,
          sliceAmount: net,
          creditActualReductions: creditsByBill.get(bill.id) ?? [],
          projectId: bill.projectId,
        })
      : scaleBillSliceAfterCredits({
          currency: normalized,
          billNetAmount: net,
          sliceAmount: net,
          creditActualReductions: (creditsByBill.get(bill.id) ?? []).map((row) => row.amount),
        });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
    const current = result.get(bill.subcontractAgreementId) ?? zeroMoney(normalized);
    result.set(bill.subcontractAgreementId, addMoney(current, netted));
  }

  return result;
}

async function loadOpenPoCommittedByVendorForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<Map<string, MoneyValue>> {
  const byProject = await loadOpenPoCommittedByVendorForProjects(
    db,
    organizationId,
    [projectId],
    currency,
  );
  return byProject.get(projectId) ?? new Map();
}

/** Open PO committed amounts keyed by projectId → vendorId → money. */
async function loadOpenPoCommittedByVendorForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, Map<string, MoneyValue>>> {
  const result = new Map<string, Map<string, MoneyValue>>();
  if (projectIds.length === 0) return result;

  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      projectId: committedCosts.projectId,
      vendorId: purchaseOrders.vendorId,
      amount: committedCosts.amount,
      currency: committedCosts.currency,
    })
    .from(committedCosts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, committedCosts.purchaseOrderId))
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        inArray(committedCosts.projectId, [...projectIds]),
        inArray(committedCosts.status, [...OPEN_COMMITTED_STATUSES]),
        isNull(purchaseOrders.archivedAt),
      ),
    );

  for (const row of rows) {
    if (!row.projectId) continue;
    if (row.currency.toUpperCase() !== normalized) continue;
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount) continue;
    const byVendor = result.get(row.projectId) ?? new Map<string, MoneyValue>();
    const current = byVendor.get(row.vendorId) ?? zeroMoney(normalized);
    byVendor.set(row.vendorId, addMoney(current, amount));
    result.set(row.projectId, byVendor);
  }
  return result;
}

/**
 * Incremental subcontract remaining commitment for Forecast (R-003).
 * PO open committed for the project is passed separately in compose.
 */
export async function sumSubcontractRemainingCommitmentForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number }> {
  const normalized = currency.toUpperCase();
  const agreements = await db
    .select({
      id: subcontractAgreements.id,
      vendorId: subcontractAgreements.vendorId,
      currency: subcontractAgreements.currency,
      originalAmount: subcontractAgreements.originalAmount,
    })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        inArray(subcontractAgreements.status, [...ACTIVE_SUBCONTRACT_STATUSES]),
        isNull(subcontractAgreements.archivedAt),
      ),
    );

  if (agreements.length === 0) {
    return { total: zeroMoney(normalized), excludedForeignCurrencyCount: 0 };
  }

  const agreementIds = agreements.map((row) => row.id);
  const events = await db
    .select()
    .from(subcontractValueEvents)
    .where(
      and(
        eq(subcontractValueEvents.organizationId, organizationId),
        inArray(subcontractValueEvents.subcontractId, agreementIds),
      ),
    );

  const eventsByAgreement = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByAgreement.get(event.subcontractId) ?? [];
    list.push(event);
    eventsByAgreement.set(event.subcontractId, list);
  }

  const recognizedByAgreement = await loadRecognizedActualByAgreement(
    db,
    organizationId,
    agreementIds,
    normalized,
  );
  const poByVendor = await loadOpenPoCommittedByVendorForProject(
    db,
    organizationId,
    projectId,
    normalized,
  );

  let excludedForeignCurrencyCount = 0;
  const commitmentInputs: SubcontractAgreementCommitmentInput[] = [];
  for (const agreement of agreements) {
    if (agreement.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const agreementEvents = (eventsByAgreement.get(agreement.id) ?? []).map((event) => ({
      ...event,
      kind: event.kind as SubcontractValueEventKind,
    }));
    const current = computeCurrentSubcontractValue(agreementEvents, agreement.currency);
    const recognized =
      recognizedByAgreement.get(agreement.id) ?? zeroMoney(agreement.currency);
    commitmentInputs.push({
      agreementId: agreement.id,
      vendorId: agreement.vendorId,
      currency: agreement.currency,
      currentAmount: current.amount,
      recognizedActualAmount: recognized.amount,
    });
  }

  const total = sumSubcontractRemainingCommitment({
    currency: normalized,
    agreements: commitmentInputs,
    openPoByVendor: [...poByVendor.entries()].map(([vendorId, amount]) => ({
      vendorId,
      amount,
    })),
  });

  return { total: roundMoney(total), excludedForeignCurrencyCount };
}

/**
 * Set-based subcontract remaining for many projects (org rollup / home dashboard).
 * Same formulas as {@link sumSubcontractRemainingCommitmentForProject} — O(1) query
 * groups instead of O(N) serial per-project loads.
 */
export async function sumSubcontractRemainingCommitmentForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, { total: MoneyValue; excludedForeignCurrencyCount: number }>> {
  const normalized = currency.toUpperCase();
  const result = new Map<string, { total: MoneyValue; excludedForeignCurrencyCount: number }>();
  for (const projectId of projectIds) {
    result.set(projectId, { total: zeroMoney(normalized), excludedForeignCurrencyCount: 0 });
  }
  if (projectIds.length === 0) return result;

  const agreements = await db
    .select({
      id: subcontractAgreements.id,
      projectId: subcontractAgreements.projectId,
      vendorId: subcontractAgreements.vendorId,
      currency: subcontractAgreements.currency,
      originalAmount: subcontractAgreements.originalAmount,
    })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        inArray(subcontractAgreements.projectId, [...projectIds]),
        inArray(subcontractAgreements.status, [...ACTIVE_SUBCONTRACT_STATUSES]),
        isNull(subcontractAgreements.archivedAt),
      ),
    );

  if (agreements.length === 0) return result;

  const agreementIds = agreements.map((row) => row.id);
  const events = await db
    .select()
    .from(subcontractValueEvents)
    .where(
      and(
        eq(subcontractValueEvents.organizationId, organizationId),
        inArray(subcontractValueEvents.subcontractId, agreementIds),
      ),
    );

  const eventsByAgreement = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByAgreement.get(event.subcontractId) ?? [];
    list.push(event);
    eventsByAgreement.set(event.subcontractId, list);
  }

  const recognizedByAgreement = await loadRecognizedActualByAgreement(
    db,
    organizationId,
    agreementIds,
    normalized,
  );
  const poByProjectVendor = await loadOpenPoCommittedByVendorForProjects(
    db,
    organizationId,
    projectIds,
    normalized,
  );

  const agreementsByProject = new Map<string, typeof agreements>();
  for (const agreement of agreements) {
    if (!agreement.projectId) continue;
    const list = agreementsByProject.get(agreement.projectId) ?? [];
    list.push(agreement);
    agreementsByProject.set(agreement.projectId, list);
  }

  for (const [projectId, projectAgreements] of agreementsByProject) {
    let excludedForeignCurrencyCount = 0;
    const commitmentInputs: SubcontractAgreementCommitmentInput[] = [];
    for (const agreement of projectAgreements) {
      if (agreement.currency.toUpperCase() !== normalized) {
        excludedForeignCurrencyCount += 1;
        continue;
      }
      const agreementEvents = (eventsByAgreement.get(agreement.id) ?? []).map((event) => ({
        ...event,
        kind: event.kind as SubcontractValueEventKind,
      }));
      const current = computeCurrentSubcontractValue(agreementEvents, agreement.currency);
      const recognized =
        recognizedByAgreement.get(agreement.id) ?? zeroMoney(agreement.currency);
      commitmentInputs.push({
        agreementId: agreement.id,
        vendorId: agreement.vendorId,
        currency: agreement.currency,
        currentAmount: current.amount,
        recognizedActualAmount: recognized.amount,
      });
    }

    const poByVendor = poByProjectVendor.get(projectId) ?? new Map();
    const total = sumSubcontractRemainingCommitment({
      currency: normalized,
      agreements: commitmentInputs,
      openPoByVendor: [...poByVendor.entries()].map(([vendorId, amount]) => ({
        vendorId,
        amount,
      })),
    });

    result.set(projectId, {
      total: roundMoney(total),
      excludedForeignCurrencyCount,
    });
  }

  return result;
}

/** Recognized AP Actual for one subcontract agreement (card / drill-down). */
export async function loadRecognizedActualForSubcontractAgreement(
  db: DbExecutor,
  organizationId: string,
  subcontractAgreementId: string,
  currency: string,
): Promise<MoneyValue> {
  const map = await loadRecognizedActualByAgreement(
    db,
    organizationId,
    [subcontractAgreementId],
    currency,
  );
  return map.get(subcontractAgreementId) ?? zeroMoney(currency.toUpperCase());
}
