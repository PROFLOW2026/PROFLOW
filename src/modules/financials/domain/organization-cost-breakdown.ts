/**
 * Management dashboard cost cards — explicit company_only vs allocated vs action-needed.
 *
 * Reconciliation (when workKind = all):
 *   Company Actual ≈ Allocated + Company Only + Unallocated
 *
 * Company-only and unallocated are distinct business states.
 */

import {
  addMoney,
  isZeroMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  type MoneyValue,
  zeroMoney,
} from '@/shared/money';

export interface OrganizationCostBreakdown {
  readonly currency: string;
  /** Explicit company_only costs (final valid state). */
  readonly companyOnly: MoneyValue;
  /** Costs already attributed to projects (direct + allocated overhead). */
  readonly allocated: MoneyValue;
  /** Costs still requiring attribution action (excludes company_only and GCM-allocated auto_pool). */
  readonly unallocated: MoneyValue;
  readonly companyActual: MoneyValue;
  readonly reconciles: boolean;
  readonly difference: MoneyValue;
}

export function composeOrganizationCostBreakdown(input: {
  readonly currency: string;
  readonly directProjectActual: MoneyValue;
  readonly allocatedGeneralToProjects: MoneyValue;
  readonly companyActual: MoneyValue;
  readonly gcmUnallocatable: MoneyValue;
  readonly expenseCompanyOnly: MoneyValue;
  readonly laborCompanyOnly: MoneyValue;
  readonly apCompanyOnly: MoneyValue;
}): OrganizationCostBreakdown {
  const currency = input.currency.toUpperCase();
  const direct = roundMoney(input.directProjectActual);
  const allocatedGeneral = roundMoney(input.allocatedGeneralToProjects);
  const companyActual = roundMoney(input.companyActual);
  const gcmUnallocatable = roundMoney(input.gcmUnallocatable);

  const companyOnly = roundMoney(
    sumMoney(
      [
        input.expenseCompanyOnly,
        input.laborCompanyOnly,
        input.apCompanyOnly,
      ],
      currency,
    ),
  );

  const allocated = roundMoney(addMoney(direct, allocatedGeneral));

  const autoPoolUnallocatable = roundMoney(subtractMoney(gcmUnallocatable, companyOnly));
  const unallocated =
    Number(autoPoolUnallocatable.amount) < 0 ? zeroMoney(currency) : autoPoolUnallocatable;

  const expected = roundMoney(addMoney(addMoney(allocated, companyOnly), unallocated));
  const difference = roundMoney(subtractMoney(companyActual, expected));

  return {
    currency,
    companyOnly,
    allocated,
    unallocated,
    companyActual,
    reconciles: isZeroMoney(difference),
    difference,
  };
}

export function shouldSurfaceOrganizationCostBreakdown(
  breakdown: OrganizationCostBreakdown,
): boolean {
  return (
    !isZeroMoney(breakdown.companyOnly) ||
    !isZeroMoney(breakdown.allocated) ||
    !isZeroMoney(breakdown.unallocated)
  );
}
