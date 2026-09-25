import { computeMarginPercent } from '@/modules/financials/domain/profit';
import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import {
  addMoney,
  compareMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

/**
 * One client's projects, already composed by the project financial engine.
 * This module only sums those figures. It does not recompute cost.
 */
export interface ClientProfitProjectInput {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly currency: string;
  readonly excludedForeignCurrency: boolean;
  readonly priceNotSet: boolean;
  /** True when the engine withheld actual profit on a priced, base-currency project. */
  readonly withheldProfit: boolean;
  readonly profitabilityMode: ProjectProfitabilityMode | null;
  readonly currentContract: MoneyValue | null;
  readonly netBilled: MoneyValue | null;
  readonly collected: MoneyValue | null;
  readonly openAr: MoneyValue | null;
  readonly directActual: MoneyValue | null;
  readonly allocatedOverhead: MoneyValue | null;
  readonly fullActual: MoneyValue | null;
  /** `profit.actualProfit` from compose — already follows org profitability mode. */
  readonly actualProfit: MoneyValue | null;
  /** `profit.actualMarginPercent` from compose (2 decimals), or null. */
  readonly marginPercent: string | null;
}

export interface ClientProfitProjectRow {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly excludedForeignCurrency: boolean;
  readonly priceNotSet: boolean;
  readonly currentContract: MoneyValue | null;
  readonly netBilled: MoneyValue | null;
  readonly collected: MoneyValue | null;
  readonly openAr: MoneyValue | null;
  readonly directActual: MoneyValue | null;
  readonly allocatedOverhead: MoneyValue | null;
  readonly fullActual: MoneyValue | null;
  readonly profit: MoneyValue | null;
  readonly marginPercent: string | null;
}

export interface ClientProfitabilitySnapshot {
  readonly currency: string;
  readonly hasProjects: boolean;
  readonly profitabilityMode: ProjectProfitabilityMode | null;
  readonly mixedProfitabilityModes: boolean;
  /** Priced projects whose engine profit was withheld — margin is not published. */
  readonly profitIncomplete: boolean;
  readonly priceNotSetCount: number;
  readonly excludedForeignCurrencyCount: number;
  readonly currentContract: MoneyValue | null;
  readonly netBilled: MoneyValue | null;
  readonly collected: MoneyValue | null;
  readonly openAr: MoneyValue | null;
  readonly directActual: MoneyValue | null;
  readonly allocatedOverhead: MoneyValue | null;
  readonly fullActual: MoneyValue | null;
  readonly profit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly projects: readonly ClientProfitProjectRow[];
}

function sumPresent(
  values: readonly (MoneyValue | null | undefined)[],
  currency: string,
): MoneyValue | null {
  const present = values.filter((value): value is MoneyValue => value != null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => addMoney(total, value), zeroMoney(currency));
}

function emptySnapshot(currency: string): ClientProfitabilitySnapshot {
  return {
    currency,
    hasProjects: false,
    profitabilityMode: null,
    mixedProfitabilityModes: false,
    profitIncomplete: false,
    priceNotSetCount: 0,
    excludedForeignCurrencyCount: 0,
    currentContract: null,
    netBilled: null,
    collected: null,
    openAr: null,
    directActual: null,
    allocatedOverhead: null,
    fullActual: null,
    profit: null,
    marginPercent: null,
    projects: [],
  };
}

/**
 * Sum base-currency project rows. Foreign-currency projects stay on the list
 * and are left out of the totals. Profit is the sum of engine `actualProfit`
 * only — price-not-set and withheld rows are not treated as zero.
 */
export function aggregateClientProfitability(
  projects: readonly ClientProfitProjectInput[],
  currency: string,
): ClientProfitabilitySnapshot {
  if (projects.length === 0) return emptySnapshot(currency);

  const included = projects.filter((row) => !row.excludedForeignCurrency);
  const profitRows = included.filter((row) => row.actualProfit != null);
  const profit = sumPresent(
    profitRows.map((row) => row.actualProfit),
    currency,
  );
  const profitContract = sumPresent(
    profitRows.map((row) => row.currentContract),
    currency,
  );
  const profitIncomplete = included.some((row) => row.withheldProfit);
  const modes = new Set(
    included
      .map((row) => row.profitabilityMode)
      .filter((mode): mode is ProjectProfitabilityMode => mode != null),
  );

  const rows: ClientProfitProjectRow[] = projects.map((row) => ({
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    excludedForeignCurrency: row.excludedForeignCurrency,
    priceNotSet: row.priceNotSet,
    currentContract: row.excludedForeignCurrency ? null : row.currentContract,
    netBilled: row.excludedForeignCurrency ? null : row.netBilled,
    collected: row.excludedForeignCurrency ? null : row.collected,
    openAr: row.excludedForeignCurrency ? null : row.openAr,
    directActual: row.excludedForeignCurrency ? null : row.directActual,
    allocatedOverhead: row.excludedForeignCurrency ? null : row.allocatedOverhead,
    fullActual: row.excludedForeignCurrency ? null : row.fullActual,
    profit: row.excludedForeignCurrency ? null : row.actualProfit,
    marginPercent: row.excludedForeignCurrency ? null : row.marginPercent,
  }));

  rows.sort((left, right) => {
    if (left.profit && right.profit) return compareMoney(right.profit, left.profit);
    if (left.profit) return -1;
    if (right.profit) return 1;
    return left.name.localeCompare(right.name);
  });

  return {
    currency,
    hasProjects: true,
    profitabilityMode: modes.size === 1 ? [...modes][0]! : null,
    mixedProfitabilityModes: modes.size > 1,
    profitIncomplete,
    priceNotSetCount: included.filter((row) => row.priceNotSet).length,
    excludedForeignCurrencyCount: projects.filter((row) => row.excludedForeignCurrency).length,
    currentContract: sumPresent(
      included.map((row) => row.currentContract),
      currency,
    ),
    netBilled: sumPresent(
      included.map((row) => row.netBilled),
      currency,
    ),
    collected: sumPresent(
      included.map((row) => row.collected),
      currency,
    ),
    openAr: sumPresent(
      included.map((row) => row.openAr),
      currency,
    ),
    directActual: sumPresent(
      included.map((row) => row.directActual),
      currency,
    ),
    allocatedOverhead: sumPresent(
      included.map((row) => row.allocatedOverhead),
      currency,
    ),
    fullActual: sumPresent(
      included.map((row) => row.fullActual),
      currency,
    ),
    profit,
    marginPercent:
      profitIncomplete || !profit || !profitContract || isZeroMoney(profitContract)
        ? null
        : computeMarginPercent(profit, profitContract),
    projects: rows,
  };
}
