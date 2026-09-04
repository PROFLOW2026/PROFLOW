import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  apBillLines,
  apBillProjectAllocations,
  apBills,
  costCategories,
  vendors,
} from '@drizzle/schema';
import {
  areApBillProjectAllocationsAvailable,
  listActiveCreditActualReductionsForBills,
  netProjectSliceAfterCredits,
  resolveVendorBillProjectAmounts,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import type { DbCostFamily } from '@/modules/financials/domain/cost-aggregation';
import type { DbExecutor } from '@/shared/db/types';
import {
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  multiplyMoney,
  subtractMoney,
  type MoneyValue,
} from '@/shared/money';
import { lineNetMoney } from '@/modules/ap/domain/bill-line-monetary';

export interface RecognizedVendorBillAtom {
  readonly billId: string;
  /** Present when atom is a line slice. */
  readonly lineId?: string | null;
  readonly amount: MoneyValue;
  readonly vendorId: string | null;
  readonly vendorName: string | null;
  readonly vendorType: string | null;
  readonly subcontractAgreementId: string | null;
  readonly costFamily?: DbCostFamily | null;
  readonly categoryKey?: string | null;
  /**
   * DB column classification_status when present; otherwise derived from categoryKey.
   */
  readonly classificationStatus?: 'classified' | 'needs_classification';
}

/**
 * Per-bill (or per-line) recognized Actual slices for one project.
 * When bill lines exist, amounts are split by line_total weight across the
 * project-recognized NET (post credits). Vendor capability never supplies categoryKey.
 */
export async function loadRecognizedVendorBillAtomsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<readonly RecognizedVendorBillAtom[]> {
  const normalized = currency.toUpperCase();
  const useAllocations = areApBillProjectAllocationsAvailable();

  const lineTargetsProjectSql = sql`EXISTS (
    SELECT 1 FROM ${apBillLines} l
    WHERE l.ap_bill_id = ${apBills.id}
      AND l.organization_id = ${organizationId}
      AND COALESCE(l.economic_target_type, 'inherit') = 'project'
      AND l.project_id = ${projectId}
  )`;

  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
      vendorId: apBills.vendorId,
      vendorName: vendors.name,
      vendorType: vendors.type,
      subcontractAgreementId: apBills.subcontractAgreementId,
    })
    .from(apBills)
    .leftJoin(vendors, eq(vendors.id, apBills.vendorId))
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        useAllocations
          ? sql`(
              ${apBills.projectId} = ${projectId}
              OR EXISTS (
                SELECT 1 FROM ${apBillProjectAllocations} a
                WHERE a.ap_bill_id = ${apBills.id}
                  AND a.organization_id = ${organizationId}
                  AND a.target_type = 'project'
                  AND a.project_id = ${projectId}
                  AND a.status = 'applied'
              )
              OR ${lineTargetsProjectSql}
            )`
          : sql`(
              ${apBills.projectId} = ${projectId}
              OR ${lineTargetsProjectSql}
            )`,
      ),
    );

  if (billRows.length === 0) return [];

  const allocationLines: { billId: string; projectId: string; amount: string; currency: string }[] =
    [];
  const billIdsWithAllocations = new Set<string>();

  if (useAllocations) {
    const allIds = billRows.map((row) => row.id);
    const anyAlloc = await db
      .select({
        apBillId: apBillProjectAllocations.apBillId,
        projectId: apBillProjectAllocations.projectId,
        amount: apBillProjectAllocations.amount,
        currency: apBillProjectAllocations.currency,
        targetType: apBillProjectAllocations.targetType,
      })
      .from(apBillProjectAllocations)
      .where(
        and(
          eq(apBillProjectAllocations.organizationId, organizationId),
          inArray(apBillProjectAllocations.apBillId, allIds),
          eq(apBillProjectAllocations.status, 'applied'),
        ),
      );

    for (const row of anyAlloc) {
      billIdsWithAllocations.add(row.apBillId);
      if (row.targetType === 'project' && row.projectId === projectId) {
        allocationLines.push({
          billId: row.apBillId,
          projectId: row.projectId,
          amount: row.amount,
          currency: row.currency,
        });
      }
    }
  }

  const resolved = resolveVendorBillProjectAmounts({
    projectId,
    currency: normalized,
    headerBills: billRows.map((row) => ({
      billId: row.id,
      projectId: row.projectId,
      totalAmount: row.netAmount ?? row.totalAmount,
      currency: row.currency,
    })),
    allocationLines,
    billIdsWithAllocations: useAllocations ? billIdsWithAllocations : new Set(),
  });

  const allBillIds = billRows.map((row) => row.id);

  const lineRows = await db
    .select({
      id: apBillLines.id,
      apBillId: apBillLines.apBillId,
      lineTotal: apBillLines.lineTotal,
      netAmount: apBillLines.netAmount,
      currency: apBillLines.currency,
      costFamily: apBillLines.costFamily,
      costCategoryId: apBillLines.costCategoryId,
      classificationStatus: apBillLines.classificationStatus,
      economicTargetType: apBillLines.economicTargetType,
      lineProjectId: apBillLines.projectId,
      categoryKey: costCategories.key,
      categoryFamily: costCategories.family,
      sortOrder: apBillLines.sortOrder,
    })
    .from(apBillLines)
    .leftJoin(
      costCategories,
      and(
        eq(costCategories.id, apBillLines.costCategoryId),
        eq(costCategories.organizationId, apBillLines.organizationId),
      ),
    )
    .where(
      and(
        eq(apBillLines.organizationId, organizationId),
        inArray(apBillLines.apBillId, allBillIds),
      ),
    )
    .orderBy(apBillLines.sortOrder);

  const linesByBill = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const list = linesByBill.get(line.apBillId) ?? [];
    list.push(line);
    linesByBill.set(line.apBillId, list);
  }

  const resolvedBillIdSet = new Set(resolved.billIds);
  const supplementalAmounts: string[] = [];
  const supplementalBillIds: string[] = [];
  for (const row of billRows) {
    if (useAllocations && billIdsWithAllocations.has(row.id)) continue;
    if (row.projectId === projectId && resolvedBillIdSet.has(row.id)) continue;

    const lines = linesByBill.get(row.id) ?? [];
    let lineSum = 0;
    for (const line of lines) {
      if ((line.economicTargetType ?? 'inherit') !== 'project') continue;
      if (line.lineProjectId !== projectId) continue;
      lineSum += Number(lineNetMoney(line, normalized).amount);
    }
    if (lineSum > 0 && !resolvedBillIdSet.has(row.id)) {
      supplementalBillIds.push(row.id);
      supplementalAmounts.push(String(lineSum));
    }
  }

  const projectBillIds = [...resolved.billIds, ...supplementalBillIds];
  const projectAmounts = [...resolved.amounts, ...supplementalAmounts];

  const billById = new Map(billRows.map((row) => [row.id, row]));
  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    projectBillIds,
  );

  const atoms: RecognizedVendorBillAtom[] = [];

  function pushLineAtom(input: {
    billId: string;
    line: (typeof lineRows)[number];
    amount: MoneyValue;
    row: (typeof billRows)[number];
  }): void {
    const { billId, line, amount, row } = input;
    if (isZeroMoney(amount) || !isPositiveMoney(amount)) return;

    const categoryKey = line.categoryKey ?? null;
    const costFamily =
      (line.costFamily as DbCostFamily | null) ??
      (line.categoryFamily as DbCostFamily | null) ??
      null;

    atoms.push({
      billId,
      lineId: line.id,
      amount,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      vendorType: row.vendorType,
      subcontractAgreementId: row.subcontractAgreementId,
      costFamily,
      categoryKey,
      classificationStatus:
        (line.classificationStatus as 'classified' | 'needs_classification' | null) ??
        'needs_classification',
    });
  }

  for (let i = 0; i < projectAmounts.length; i += 1) {
    const billId = projectBillIds[i]!;
    const amountStr = projectAmounts[i]!;
    const row = billById.get(billId);
    if (!row) continue;
    if (row.currency.toUpperCase() !== normalized) continue;
    const billNet = row.netAmount ?? row.totalAmount;
    const netted = netProjectSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: amountStr,
      creditActualReductions: creditsByBill.get(billId) ?? [],
      projectId,
    });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;

    const lines = linesByBill.get(billId) ?? [];
    const explicitDestinationLines = lines.filter(
      (line) => (line.economicTargetType ?? 'inherit') !== 'inherit',
    );

    if (lines.length > 0 && explicitDestinationLines.length > 0) {
      const projectLines = lines.filter((line) => {
        const targetType = line.economicTargetType ?? 'inherit';
        if (targetType === 'overhead') return false;
        const lineProject =
          targetType === 'project'
            ? line.lineProjectId
            : targetType === 'inherit'
              ? row.projectId
              : null;
        return lineProject === projectId;
      });
      if (projectLines.length === 0) continue;

      const projectLineNetSum = projectLines.reduce(
        (acc, line) => acc + Number(lineNetMoney(line, normalized).amount),
        0,
      );
      if (!Number.isFinite(projectLineNetSum) || projectLineNetSum <= 0) continue;

      let remaining = netted;
      for (let li = 0; li < projectLines.length; li += 1) {
        const line = projectLines[li]!;
        const isLast = li === projectLines.length - 1;
        const weight = Number(lineNetMoney(line, normalized).amount) / projectLineNetSum;
        const slice = isLast ? remaining : multiplyMoney(netted, weight);
        if (!isLast) {
          remaining = subtractMoney(remaining, slice);
        }
        pushLineAtom({ billId, line, amount: slice, row });
      }
      continue;
    }

    const lineWeightSum = lines.reduce(
      (acc, line) => acc + Number(lineNetMoney(line, normalized).amount),
      0,
    );

    if (lines.length > 0 && Number.isFinite(lineWeightSum) && lineWeightSum > 0) {
      let remaining = netted;
      for (let li = 0; li < lines.length; li += 1) {
        const line = lines[li]!;
        const isLast = li === lines.length - 1;
        const weight = Number(lineNetMoney(line, normalized).amount) / lineWeightSum;
        const slice = isLast ? remaining : multiplyMoney(netted, weight);
        if (!isLast) {
          remaining = subtractMoney(remaining, slice);
        }
        pushLineAtom({ billId, line, amount: slice, row });
      }
      continue;
    }

    // Line-level classification is financial authority. Header category/family
    // must not classify a bill that has no usable lines.
    atoms.push({
      billId,
      lineId: null,
      amount: netted,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      vendorType: row.vendorType,
      subcontractAgreementId: row.subcontractAgreementId,
      costFamily: null,
      categoryKey: null,
      classificationStatus: 'needs_classification',
    });
  }

  return atoms;
}

export function moneyOrNull(amount: string | null | undefined, currency: string): MoneyValue | null {
  if (amount == null) return null;
  return fromNumericString(amount, currency);
}
