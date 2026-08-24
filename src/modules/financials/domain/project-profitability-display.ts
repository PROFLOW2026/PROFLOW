import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import { computeMarginPercent } from './profit';
import type { CostPosition } from './types';
import {
  addMoney,
  isZeroMoney,
  roundMoney,
  subtractMoney,
  type MoneyValue,
} from '@/shared/money';

export interface ProjectProfitabilityDisplay {
  readonly mode: ProjectProfitabilityMode;
  /** Primary Actual cost for KPI display (Direct or Full per mode). */
  readonly primaryActualCost: MoneyValue;
  /** Canonical Direct Actual — always expenses + labor + AP + month-close. */
  readonly directActualCost: MoneyValue;
  /** Direct + allocated general business cost. */
  readonly fullActualCost: MoneyValue;
  /** Primary profit for KPI display. */
  readonly primaryProfit: MoneyValue | null;
  readonly primaryProfitPercent: string | null;
  /** Direct profit (contract − Direct). Present in `both` mode. */
  readonly directProfit: MoneyValue | null;
  readonly directProfitPercent: string | null;
  /** Profit after general allocation (contract − Full). Present in `both` mode. */
  readonly afterGeneralProfit: MoneyValue | null;
  readonly afterGeneralProfitPercent: string | null;
  readonly showBothProfits: boolean;
}

function resolveFullActualCost(cost: CostPosition): MoneyValue {
  if (cost.fullActualCostToDate) {
    return cost.fullActualCostToDate;
  }
  const direct = cost.directActualCostToDate ?? cost.actualCostToDate;
  return roundMoney(addMoney(direct, cost.allocatedGeneralBusinessCost));
}

function profitFromContract(
  contract: MoneyValue,
  actual: MoneyValue,
): { profit: MoneyValue; percent: string | null } {
  const profit = subtractMoney(contract, actual);
  const percent = isZeroMoney(contract) ? null : computeMarginPercent(profit, contract);
  return { profit, percent };
}

/**
 * Map org profitability mode + composed cost into display figures.
 * Economic fields on CostPosition are unchanged — display only.
 */
export function resolveProjectProfitabilityDisplay(
  mode: ProjectProfitabilityMode,
  cost: CostPosition,
  contract: MoneyValue | null,
  priceNotSet: boolean,
): ProjectProfitabilityDisplay {
  const directActualCost = roundMoney(cost.directActualCostToDate ?? cost.actualCostToDate);
  const fullActualCost = resolveFullActualCost(cost);

  const emptyProfit = {
    primaryProfit: null as MoneyValue | null,
    primaryProfitPercent: null as string | null,
    directProfit: null as MoneyValue | null,
    directProfitPercent: null as string | null,
    afterGeneralProfit: null as MoneyValue | null,
    afterGeneralProfitPercent: null as string | null,
    showBothProfits: false,
  };

  if (priceNotSet || !contract) {
    return {
      mode,
      primaryActualCost: mode === 'include_general' ? fullActualCost : directActualCost,
      directActualCost,
      fullActualCost,
      ...emptyProfit,
    };
  }

  const directFigures = profitFromContract(contract, directActualCost);
  const fullFigures = profitFromContract(contract, fullActualCost);

  switch (mode) {
    case 'include_general':
      return {
        mode,
        primaryActualCost: fullActualCost,
        directActualCost,
        fullActualCost,
        primaryProfit: fullFigures.profit,
        primaryProfitPercent: fullFigures.percent,
        directProfit: null,
        directProfitPercent: null,
        afterGeneralProfit: null,
        afterGeneralProfitPercent: null,
        showBothProfits: false,
      };
    case 'both':
      return {
        mode,
        primaryActualCost: directActualCost,
        directActualCost,
        fullActualCost,
        primaryProfit: directFigures.profit,
        primaryProfitPercent: directFigures.percent,
        directProfit: directFigures.profit,
        directProfitPercent: directFigures.percent,
        afterGeneralProfit: fullFigures.profit,
        afterGeneralProfitPercent: fullFigures.percent,
        showBothProfits: true,
      };
    case 'direct':
    default:
      return {
        mode,
        primaryActualCost: directActualCost,
        directActualCost,
        fullActualCost,
        primaryProfit: directFigures.profit,
        primaryProfitPercent: directFigures.percent,
        directProfit: null,
        directProfitPercent: null,
        afterGeneralProfit: null,
        afterGeneralProfitPercent: null,
        showBothProfits: false,
      };
  }
}
