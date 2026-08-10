import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { NotFoundError } from '@/shared/errors';
import { isPositiveMoney, isZeroMoney, money } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import {
  computeBillOutstanding,
  getVendorPaymentsRepository,
  isRecognizedVendorBillStatus,
  listApBills,
} from '@/modules/ap';
import { loadCashFlowPayments } from '../data/billing.repository';
import {
  buildCashFlowOutlook,
  type ApBillCashInput,
  type CashFlowOutlook,
} from '../domain/cash-flow';
import { assertProjectInOrg, findProjectCurrency } from '../data/projects.repository';

/**
 * Per-project expected incoming (Forecast from Outstanding due dates) plus
 * Actual Paid collected this month for that project's billing. Requires
 * PROJECT_FINANCIALS_READ and BILLING_READ. Outgoing uses cash outstanding
 * (bill total − active vendor payment applications) when AP_READ is present.
 * Payments never enter Actual Cost.
 */
export async function getProjectCashFlowOutlook(
  context: OrgContext,
  projectId: string,
): Promise<CashFlowOutlook | null> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return null;

  const exists = await assertProjectInOrg(context.db, context.organizationId, projectId);
  if (!exists) throw new NotFoundError('Project');

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = await findProjectCurrency(
    context.db,
    context.organizationId,
    projectId,
    context.organization.baseCurrency,
  );

  const [records, paymentRows, apRows] = await Promise.all([
    listBillingRecords(context, { filter: 'all', projectId, limit: ORG_LIST_EXPORT_CAP }),
    loadCashFlowPayments(context.db, context.organizationId, { projectId }),
    hasPermission(context, PERMISSIONS.AP_READ)
      ? listApBills(context.db, context.organizationId, { limit: ORG_LIST_EXPORT_CAP })
      : Promise.resolve([]),
  ]);

  const outstandingRecords = records.filter(
    (record) =>
      record.totalAmount.currency === currency && !isZeroMoney(record.outstandingAmount),
  );

  const payments = paymentRows.filter((row) => row.amount.currency === currency);

  let openApBills: ApBillCashInput[] | undefined;
  if (hasPermission(context, PERMISSIONS.AP_READ)) {
    const projectBills = apRows.filter(
      (row) => row.projectId === projectId && isRecognizedVendorBillStatus(row.status),
    );
    const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
      context.db,
      context.organizationId,
      projectBills.map((row) => row.id),
    );
    openApBills = [];
    for (const row of projectBills) {
      if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
      const outstanding = computeBillOutstanding({
        billStatus: row.status,
        billTotal: money(row.totalAmount, row.currency),
        applications: (appliedByBillId.get(row.id) ?? []).map((amount) => ({
          appliedAmount: money(amount, row.currency),
          paymentStatus: 'recorded' as const,
        })),
      });
      if (!isPositiveMoney(outstanding)) continue;
      openApBills.push({
        status: row.status,
        dueDate: (row.dueDate as BusinessDate | null) ?? null,
        totalAmount: outstanding,
      });
    }
  }

  return buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords,
    payments,
    openApBills,
  });
}
