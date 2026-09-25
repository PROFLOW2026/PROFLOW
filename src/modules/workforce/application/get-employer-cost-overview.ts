import { isAllocationIntentSchemaReady } from '@/modules/financials';
import type { OrgContext } from '@/shared/auth/context';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import {
  sumAppliedLaborAllocationToProjects,
  sumEmployeeMonthCostFacts,
} from '../data/employer-cost-overview.repository';
import { sumOrganizationMonthlyLaborCompanyOnly } from '../data/labor-displacement.repository';
import { assertCanReadWorkforceCost } from './workforce-cost-authz';

export interface EmployerCostOverview {
  readonly currency: string;
  readonly monthFactCount: number;
  readonly estimated: MoneyValue;
  readonly actual: MoneyValue;
  readonly projectAllocated: MoneyValue;
  /** Null when the company-only column is not available on this database. */
  readonly companyOnly: MoneyValue | null;
}

/**
 * Org employer-cost snapshot: month-fact estimated vs actual, applied allocation
 * lines (projects), and company-only on applied runs. Not payroll.
 */
export async function getEmployerCostOverview(context: OrgContext): Promise<EmployerCostOverview> {
  assertCanReadWorkforceCost(context);
  const currency = context.organization.baseCurrency;
  const [facts, allocated, companyOnlyReady] = await Promise.all([
    sumEmployeeMonthCostFacts(context.db, context.organizationId, currency),
    sumAppliedLaborAllocationToProjects(context.db, context.organizationId, currency),
    isAllocationIntentSchemaReady(context.db),
  ]);

  const companyOnly = companyOnlyReady
    ? (fromNumericString(
        (
          await sumOrganizationMonthlyLaborCompanyOnly(
            context.db,
            context.organizationId,
            currency,
          )
        ).totalAmount,
        currency,
      ) ?? zeroMoney(currency))
    : null;

  return {
    currency,
    monthFactCount: facts.monthFactCount,
    estimated: fromNumericString(facts.estimatedAmount, currency) ?? zeroMoney(currency),
    actual: fromNumericString(facts.actualAmount, currency) ?? zeroMoney(currency),
    projectAllocated: fromNumericString(allocated.totalAmount, currency) ?? zeroMoney(currency),
    companyOnly,
  };
}
