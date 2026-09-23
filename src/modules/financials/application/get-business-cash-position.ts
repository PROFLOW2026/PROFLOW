/**
 * Organization business cash position — paid vs outstanding payables.
 * Separate from recognized cost; uses canonical payment sources with Expense/AP dedup.
 */

import { getOrganizationApPayables, type OrgApPayablesSummary } from '@/modules/ap';
import type { OrgContext } from '@/shared/auth/context';
import { fromNumericString, money, zeroMoney } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  aggregateExpenseCashBySource,
  composeBusinessCashPosition,
  type BusinessCashPosition,
} from '../domain/business-cash-position';
import {
  loadOrganizationExpenseCashRows,
  sumOrganizationPayrollCashOutstanding,
  sumOrganizationPayrollCashPaid,
  sumOrganizationSubcontractAdvancesPaid,
} from '../data/business-cash-position.repository';

export type { BusinessCashPosition, BusinessCashSourceKey } from '../domain/business-cash-position';

export async function getBusinessCashPosition(
  context: OrgContext,
  options: { readonly apPayables?: OrgApPayablesSummary | null } = {},
): Promise<BusinessCashPosition | null> {
  const currency = context.organization.baseCurrency.toUpperCase();
  const canReadCosts = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  if (!canReadCosts && !canReadAp) return null;

  const apPayablesPromise =
    options.apPayables !== undefined
      ? Promise.resolve(options.apPayables)
      : canReadAp
        ? getOrganizationApPayables(context, { currency })
        : Promise.resolve(null);

  const [expenseRows, apPayables, payrollPaidRaw, payrollOutstandingRaw, advancesPaidRaw] =
    await Promise.all([
      canReadCosts
        ? loadOrganizationExpenseCashRows(context.db, context.organizationId, currency)
        : Promise.resolve([]),
      apPayablesPromise,
      canReadCosts && canReadWorkforce
        ? sumOrganizationPayrollCashPaid(context.db, context.organizationId, currency)
        : Promise.resolve(null),
      canReadCosts && canReadWorkforce
        ? sumOrganizationPayrollCashOutstanding(context.db, context.organizationId, currency)
        : Promise.resolve(null),
      canReadAp
        ? sumOrganizationSubcontractAdvancesPaid(context.db, context.organizationId, currency)
        : Promise.resolve(null),
    ]);

  const expenseSources = canReadCosts
    ? aggregateExpenseCashBySource(expenseRows, currency)
    : {};

  const apPaid =
    apPayables && Number(apPayables.paid) > 0
      ? money(apPayables.paid, apPayables.currency)
      : apPayables
        ? zeroMoney(currency)
        : null;
  const apOutstanding =
    apPayables && Number(apPayables.outstanding) > 0
      ? money(apPayables.outstanding, apPayables.currency)
      : apPayables
        ? zeroMoney(currency)
        : null;

  const payrollPaid = payrollPaidRaw
    ? (fromNumericString(payrollPaidRaw, currency) ?? zeroMoney(currency))
    : null;
  const payrollOutstanding = payrollOutstandingRaw
    ? (fromNumericString(payrollOutstandingRaw, currency) ?? zeroMoney(currency))
    : null;
  const advancesPaid = advancesPaidRaw
    ? (fromNumericString(advancesPaidRaw, currency) ?? zeroMoney(currency))
    : null;

  const position = composeBusinessCashPosition({
    currency,
    expenseSources,
    apPaid,
    apOutstanding,
    payrollPaid,
    payrollOutstanding,
    subcontractAdvancesPaid: advancesPaid,
  });

  if (position.actualPaid == null && position.outstandingPayable == null) {
    return null;
  }

  return position;
}
