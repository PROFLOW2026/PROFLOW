import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { apBillProjectAllocations, apBills, vendors } from '@drizzle/schema';
import {
  areApBillProjectAllocationsAvailable,
  listActiveCreditActualReductionsForBills,
  resolveVendorBillProjectAmounts,
  scaleBillSliceAfterCredits,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import type { DbExecutor } from '@/shared/db/types';
import {
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  type MoneyValue,
} from '@/shared/money';

export interface RecognizedVendorBillAtom {
  readonly billId: string;
  readonly amount: MoneyValue;
  readonly vendorId: string | null;
  readonly vendorName: string | null;
  readonly vendorType: string | null;
  readonly subcontractAgreementId: string | null;
}

/**
 * Per-bill recognized Actual slices for one project (same math as
 * loadRecognizedVendorBillsForProject) — set-based, for Owner breakdown.
 */
export async function loadRecognizedVendorBillAtomsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<readonly RecognizedVendorBillAtom[]> {
  const normalized = currency.toUpperCase();
  const useAllocations = areApBillProjectAllocationsAvailable();

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
            )`
          : eq(apBills.projectId, projectId),
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

  const billById = new Map(billRows.map((row) => [row.id, row]));
  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    resolved.billIds,
  );

  const atoms: RecognizedVendorBillAtom[] = [];
  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const billId = resolved.billIds[i]!;
    const amountStr = resolved.amounts[i]!;
    const row = billById.get(billId);
    if (!row) continue;
    if (row.currency.toUpperCase() !== normalized) continue;
    const billNet = row.netAmount ?? row.totalAmount;
    const netted = scaleBillSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: amountStr,
      creditActualReductions: creditsByBill.get(billId) ?? [],
    });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
    atoms.push({
      billId,
      amount: netted,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      vendorType: row.vendorType,
      subcontractAgreementId: row.subcontractAgreementId,
    });
  }

  return atoms;
}

export function moneyOrNull(amount: string | null | undefined, currency: string): MoneyValue | null {
  if (amount == null) return null;
  return fromNumericString(amount, currency);
}
