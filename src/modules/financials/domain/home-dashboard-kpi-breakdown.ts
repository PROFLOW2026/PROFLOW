import type { MoneyValue } from '@/shared/money';

/** Operand snapshot for dashboard KPI detail modals — no new calculations. */
export interface HomeDashboardKpiBreakdown {
  readonly laborActual: MoneyValue | null;
  readonly vendorActual: MoneyValue | null;
  readonly overheadAllocated: MoneyValue | null;
  readonly directProjectActual: MoneyValue | null;
  readonly generalPool: MoneyValue | null;
  readonly allocatedGeneralToProjects: MoneyValue | null;
  readonly unallocatableGeneral: MoneyValue | null;
  readonly committed: MoneyValue | null;
  readonly expectedRemaining: MoneyValue | null;
  readonly estimatedFinal: MoneyValue | null;
  readonly unallocatedBusinessCosts: MoneyValue | null;
  readonly actionableUnallocatedCosts: MoneyValue | null;
  readonly companyOnlyExpenses: MoneyValue | null;
  readonly recognizedCompanyRevenue: MoneyValue | null;
}
