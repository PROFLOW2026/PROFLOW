/**
 * Queries the total cash paid (AP payments applied to bills) for a project.
 *
 * Financial semantics:
 *  - "Recognized" (vendor Actual) ≠ "Cash Paid" (payment outflow).
 *  - This function returns only the cash-paid side; caller must compare with
 *    vendorActual and openApPayable from ProjectFinancials to form the full picture.
 *
 * Guard: returns zero when ap_payments schema is not yet available.
 */

import { and, eq, sql } from 'drizzle-orm';
import { apBillProjectAllocations, apBills, apPaymentApplications, apPayments } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { areApPaymentsAvailable } from '@/modules/ap/domain/vendor-payments';
import { areApBillProjectAllocationsAvailable } from '@/modules/ap';
import { fromNumericString, zeroMoney, roundMoney, addMoney, type MoneyValue } from '@/shared/money';

export async function loadProjectApCashPaid(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<MoneyValue> {
  const normalized = currency.toUpperCase();

  // Guard: ap_payments schema may not be migrated yet.
  if (!areApPaymentsAvailable()) return zeroMoney(normalized);

  // Path A: bills directly assigned to the project (project_id on bill header).
  const directRows = await db
    .select({
      total: sql<string | null>`sum(${apPaymentApplications.appliedAmount})::text`,
    })
    .from(apPaymentApplications)
    .innerJoin(apPayments, eq(apPaymentApplications.apPaymentId, apPayments.id))
    .innerJoin(apBills, eq(apPaymentApplications.apBillId, apBills.id))
    .where(
      and(
        eq(apPaymentApplications.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        eq(apPayments.status, 'recorded'),
        sql`upper(${apPaymentApplications.currency}) = upper(${normalized})`,
      ),
    );

  const directAmount = fromNumericString(directRows[0]?.total ?? '0', normalized) ?? zeroMoney(normalized);

  // Path B: bills linked via project allocations (split-bill flow).
  // Only query when the allocation table is available.
  if (!areApBillProjectAllocationsAvailable()) {
    return roundMoney(directAmount);
  }

  const allocatedBillIds = await db
    .select({ apBillId: apBillProjectAllocations.apBillId })
    .from(apBillProjectAllocations)
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        eq(apBillProjectAllocations.projectId, projectId),
        eq(apBillProjectAllocations.targetType, 'project'),
        eq(apBillProjectAllocations.status, 'applied'),
      ),
    );

  if (allocatedBillIds.length === 0) return roundMoney(directAmount);

  // Exclude bills already counted in the direct path to avoid double-counting.
  // Use a NOT IN approach on the bill IDs — safe because the set is bounded.
  const allocatedIds = [...new Set(allocatedBillIds.map((r) => r.apBillId))];

  const allocatedRows = await db
    .select({
      total: sql<string | null>`sum(${apPaymentApplications.appliedAmount})::text`,
    })
    .from(apPaymentApplications)
    .innerJoin(apPayments, eq(apPaymentApplications.apPaymentId, apPayments.id))
    .innerJoin(apBills, eq(apPaymentApplications.apBillId, apBills.id))
    .where(
      and(
        eq(apPaymentApplications.organizationId, organizationId),
        sql`${apPaymentApplications.apBillId} = ANY(ARRAY[${sql.join(allocatedIds.map((id) => sql`${id}::uuid`), sql`, `)}])`,
        // Exclude bills already in the direct path to avoid double-counting
        sql`${apBills.projectId} IS DISTINCT FROM ${projectId}`,
        eq(apPayments.status, 'recorded'),
        sql`upper(${apPaymentApplications.currency}) = upper(${normalized})`,
      ),
    );

  const allocatedAmount = fromNumericString(allocatedRows[0]?.total ?? '0', normalized) ?? zeroMoney(normalized);

  return roundMoney(addMoney(directAmount, allocatedAmount));
}
