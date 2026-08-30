import { describe, expect, it } from 'vitest';
import {
  computeSubcontractAgreementRemaining,
  computeVendorSubcontractRemainingNet,
  sumSubcontractRemainingCommitment,
} from '@/modules/vendors/domain/subcontract-commitment';
import { mergeProjectRemainingCommitments } from '@/modules/financials/domain/merge-commitments';
import { withCommittedAndApPayable } from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

describe('subcontract remaining commitment (R-003)', () => {
  it('computes agreement remaining as current minus recognized', () => {
    expect(
      computeSubcontractAgreementRemaining({
        currency: ILS,
        currentAmount: '100000',
        recognizedActualAmount: '40000',
      }),
    ).toEqual(money('60000', ILS));
  });

  it('nets open PO on same vendor to avoid double-count with committed_costs', () => {
    const net = computeVendorSubcontractRemainingNet({
      currency: ILS,
      agreements: [
        {
          agreementId: 'a1',
          vendorId: 'v1',
          currency: ILS,
          currentAmount: '100000',
          recognizedActualAmount: '40000',
        },
      ],
      openPoCommittedAmount: '30000',
    });
    expect(net).toEqual(money('30000', ILS));
  });

  it('merges PO committed and subcontract remaining for forecast', () => {
    const merged = mergeProjectRemainingCommitments({
      currency: ILS,
      poCommitted: money('30000', ILS),
      subcontractRemaining: money('30000', ILS),
    });
    const cost = withCommittedAndApPayable(
      {
        actualCostToDate: money('40000', ILS),
        estimatedFinalCost: money('40000', ILS),
        byFamily: {
          directProject: money('40000', ILS),
          shared: zeroMoney(ILS),
          businessOverhead: zeroMoney(ILS),
          assetCapital: zeroMoney(ILS),
        },
        laborActual: zeroMoney(ILS),
        vendorActual: money('40000', ILS),
        overheadActual: zeroMoney(ILS),
        committedOpen: zeroMoney(ILS),
        expectedRemainingCost: zeroMoney(ILS),
        openApPayable: zeroMoney(ILS),
        monthCloseCostNet: zeroMoney(ILS),
        directActualCostToDate: money('40000', ILS),
        allocatedGeneralBusinessCost: zeroMoney(ILS),
        fullActualCostToDate: money('40000', ILS),
        futureGeneralAllocatedForecast: zeroMoney(ILS),
        directForecastFinalCost: money('40000', ILS),
        fullForecastFinalCost: money('40000', ILS),
      },
      merged,
      zeroMoney(ILS),
      zeroMoney(ILS),
    );
    expect(cost.estimatedFinalCost).toEqual(money('100000', ILS));
  });

  it('sums subcontract remaining across vendors', () => {
    const total = sumSubcontractRemainingCommitment({
      currency: ILS,
      agreements: [
        {
          agreementId: 'a1',
          vendorId: 'v1',
          currency: ILS,
          currentAmount: '50000',
          recognizedActualAmount: '10000',
        },
        {
          agreementId: 'a2',
          vendorId: 'v2',
          currency: ILS,
          currentAmount: '80000',
          recognizedActualAmount: '20000',
        },
      ],
      openPoByVendor: [{ vendorId: 'v1', amount: money('5000', ILS) }],
    });
    expect(total).toEqual(money('95000', ILS));
  });
});
