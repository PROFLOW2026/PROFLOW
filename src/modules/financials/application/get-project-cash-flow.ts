import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import { isZeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import { loadCashFlowPayments } from '../data/billing.repository';
import { buildCashFlowOutlook, type CashFlowOutlook } from '../domain/cash-flow';
import { assertProjectInOrg, findProjectCurrency } from '../data/projects.repository';

/**
 * Per-project expected incoming (Forecast from Outstanding due dates) plus
 * Actual Paid collected this month for that project's billing. Requires
 * PROJECT_FINANCIALS_READ and BILLING_READ.
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

  const [records, paymentRows] = await Promise.all([
    listBillingRecords(context, { filter: 'all', projectId, limit: 5_000 }),
    loadCashFlowPayments(context.db, context.organizationId, { projectId }),
  ]);

  const outstandingRecords = records.filter(
    (record) =>
      record.totalAmount.currency === currency && !isZeroMoney(record.outstandingAmount),
  );

  const payments = paymentRows.filter((row) => row.amount.currency === currency);

  return buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords,
    payments,
  });
}
