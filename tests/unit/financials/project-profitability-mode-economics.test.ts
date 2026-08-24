import { describe, expect, it } from 'vitest';
import {
  emptyCostPosition,
  withAllocatedGeneralBusinessCost,
} from '@/modules/financials/domain/cost-aggregation';
import { composeCompanyActual } from '@/modules/financials/domain/company-actual';
import { resolveProjectProfitabilityDisplay } from '@/modules/financials/domain/project-profitability-display';
import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';
const MODES: readonly ProjectProfitabilityMode[] = ['direct', 'include_general', 'both'];

function buildCostPosition() {
  const direct = money('60000', ILS);
  const allocated = money('10000', ILS);
  const base = {
    ...emptyCostPosition(ILS),
    actualCostToDate: direct,
    directActualCostToDate: direct,
    estimatedFinalCost: direct,
  };
  return withAllocatedGeneralBusinessCost(base, allocated);
}

describe('project profitability mode — display-only switch', () => {
  it('leaves Direct, allocated, full, and company Actual unchanged across modes', () => {
    const cost = buildCostPosition();
    const contract = money('100000', ILS);

    const company = composeCompanyActual({
      currency: ILS,
      directProjectActual: cost.directActualCostToDate,
      generalPool: money('10000', ILS),
      allocatedGeneralToProjects: cost.allocatedGeneralBusinessCost,
      unallocatableGeneral: zeroMoney(ILS),
    });

    const displays = MODES.map((mode) =>
      resolveProjectProfitabilityDisplay(mode, cost, contract, false),
    );

    for (const display of displays) {
      expect(display.directActualCost).toEqual(money('60000', ILS));
      expect(display.fullActualCost).toEqual(money('70000', ILS));
    }

    expect(cost.actualCostToDate).toEqual(money('60000', ILS));
    expect(cost.directActualCostToDate).toEqual(money('60000', ILS));
    expect(cost.allocatedGeneralBusinessCost).toEqual(money('10000', ILS));
    expect(cost.fullActualCostToDate).toEqual(money('70000', ILS));
    expect(company.companyActual).toEqual(money('70000', ILS));
    expect(company.directProjectActual).toEqual(money('60000', ILS));
    expect(company.allocatedGeneralToProjects).toEqual(money('10000', ILS));

    expect(displays[0]!.primaryActualCost).toEqual(money('60000', ILS));
    expect(displays[1]!.primaryActualCost).toEqual(money('70000', ILS));
    expect(displays[2]!.primaryActualCost).toEqual(money('60000', ILS));
  });
});
