import type { OrganizationFinancials } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { endOfMonth, startOfMonth, todayInTimeZone } from '@/shared/dates';
import { fromNumericString, zeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { buildFinancialCoverage, defaultCostSourcePresence } from '../domain/coverage';
import {
  computeBillingPositionFromRows,
  loadOrganizationBillingRows,
  sumInvoicedInDateRange,
} from '../data/billing.repository';
import { sumUnbilledApprovedChanges } from '../data/commercial.repository';
import { sumOrganizationCostsInDateRange } from '../data/expenses.repository';
import { hasAnyExpenseUsage } from '../data/expenses.repository';

export async function getOrganizationFinancials(
  context: OrgContext,
): Promise<OrganizationFinancials> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const currency = context.organization.baseCurrency;
  const today = todayInTimeZone(context.organization.timezone);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);

  let outstanding = zeroMoney(currency);
  let invoicedThisMonth = zeroMoney(currency);
  let approvedNotBilled = zeroMoney(currency);

  if (canReadBilling) {
    const billingRows = await loadOrganizationBillingRows(context.db, context.organizationId);
    const position = computeBillingPositionFromRows(billingRows, currency);
    outstanding = position.outstanding;
    invoicedThisMonth = await sumInvoicedInDateRange(
      context.db,
      context.organizationId,
      currency,
      monthStart,
      monthEnd,
    );
  }

  const costsThisMonth = await sumOrganizationCostsInDateRange(
    context.db,
    context.organizationId,
    currency,
    monthStart,
    monthEnd,
  );

  const unbilled = await sumUnbilledApprovedChanges(context.db, context.organizationId, currency);
  approvedNotBilled =
    fromNumericString(unbilled.amount, currency) ?? zeroMoney(currency);

  const hasExpenses = await hasAnyExpenseUsage(context.db, context.organizationId);

  const coverage = buildFinancialCoverage(
    defaultCostSourcePresence().map((item) =>
      item.source === 'direct_expenses' ? { ...item, hasData: hasExpenses } : item,
    ),
  );

  return {
    currency,
    outstanding,
    invoicedThisMonth,
    costsThisMonth,
    approvedNotBilled,
    coverage,
  };
}
