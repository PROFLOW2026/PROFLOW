import { describe, expect, it } from 'vitest';
import {
  composeVendorCostRecognition,
  composeVendorForecastExposure,
  consumeAmountForPostedPoBill,
  isRecognizedVendorBillStatus,
  isVendorBillExcludedFromActual,
  isVendorPaymentRecognizedActual,
  netActualAfterVendorRecognition,
  shouldConsumeCommitmentOnMatchAccept,
  shouldReleaseRemainingCommitmentOnSettlement,
} from '@/modules/ap/domain/vendor-cost-recognition';
import { computeCommittedAfterConsumption } from '@/modules/procurement';
import {
  computeForecastFinalCost,
  withCommittedAndApPayable,
  withRecognizedVendorBills,
  emptyCostPosition,
} from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

describe('vendor cost recognition model', () => {
  it('treats open/partially_matched/matched bills as recognized actual; draft/void excluded', () => {
    expect(isRecognizedVendorBillStatus('open')).toBe(true);
    expect(isRecognizedVendorBillStatus('partially_matched')).toBe(true);
    expect(isRecognizedVendorBillStatus('matched')).toBe(true);
    expect(isRecognizedVendorBillStatus('draft')).toBe(false);
    expect(isRecognizedVendorBillStatus('void')).toBe(false);
    expect(isVendorBillExcludedFromActual('draft')).toBe(true);
    expect(isVendorBillExcludedFromActual('void')).toBe(true);
  });

  it('never treats vendor payment as recognized actual (cash only)', () => {
    expect(isVendorPaymentRecognizedActual()).toBe(false);
  });

  it('PO 100k → bill 92k settled → Actual 92k, Commitment 0 (never 0+0)', () => {
    // Posted bill recognizes actual; full match settles remaining commitment variance.
    const afterBill = consumeAmountForPostedPoBill({
      openCommitmentAmount: '100000',
      billTotal: '92000',
      currency: ILS,
    });
    const afterConsume = computeCommittedAfterConsumption({
      openAmount: '100000',
      consumeAmount: afterBill.consumeAmount,
      currency: ILS,
    });
    expect(afterConsume.remainingAmount).toBe(money('8000', ILS).amount);

    // Fully matched bill releases remaining commitment (settlement).
    expect(
      shouldReleaseRemainingCommitmentOnSettlement({
        billStatusAfterAccept: 'matched',
        purchaseOrderId: 'po-1',
      }),
    ).toBe(true);
    const settled = computeCommittedAfterConsumption({
      openAmount: afterConsume.remainingAmount,
      consumeAmount: afterConsume.remainingAmount,
      currency: ILS,
    });
    expect(settled.remainingAmount).toBe(zeroMoney(ILS).amount);
    expect(settled.status).toBe('closed');

    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: ['92000'],
      linkedExpenseAmounts: [],
    });
    let cost = withRecognizedVendorBills(
      emptyCostPosition(ILS),
      recognized.netRecognizedVendorActual,
    );
    cost = withCommittedAndApPayable(
      cost,
      money(settled.remainingAmount, ILS),
      money('92000', ILS), // AP cash disclosure may still show payable
      zeroMoney(ILS),
    );

    expect(cost.actualCostToDate).toEqual(money('92000', ILS));
    expect(cost.committedOpen).toEqual(zeroMoney(ILS));
    expect(cost.estimatedFinalCost).toEqual(money('92000', ILS));
    expect(cost.openApPayable).toEqual(money('92000', ILS));

    const exposure = composeVendorForecastExposure({
      currency: ILS,
      actualCostToDate: cost.actualCostToDate.amount,
      remainingCommitment: cost.committedOpen.amount,
    });
    expect(exposure.losesKnownCost).toBe(false);
    expect(exposure.forecastFinalCost).toEqual(money('92000', ILS));
  });

  it('partial bill 40k of 100k → recognized 40k + commitment 60k', () => {
    const { consumeAmount } = consumeAmountForPostedPoBill({
      openCommitmentAmount: '100000',
      billTotal: '40000',
      currency: ILS,
    });
    const remaining = computeCommittedAfterConsumption({
      openAmount: '100000',
      consumeAmount,
      currency: ILS,
    });
    expect(remaining.remainingAmount).toBe(money('60000', ILS).amount);
    expect(remaining.status).toBe('partially_consumed');

    // Progress bill stays open — do not release remaining commitment.
    expect(
      shouldReleaseRemainingCommitmentOnSettlement({
        billStatusAfterAccept: 'open',
        purchaseOrderId: 'po-1',
      }),
    ).toBe(false);

    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: ['40000'],
      linkedExpenseAmounts: [],
    });
    let cost = withRecognizedVendorBills(
      emptyCostPosition(ILS),
      recognized.netRecognizedVendorActual,
    );
    cost = withCommittedAndApPayable(
      cost,
      money(remaining.remainingAmount, ILS),
      zeroMoney(ILS),
      zeroMoney(ILS),
    );

    expect(cost.actualCostToDate).toEqual(money('40000', ILS));
    expect(cost.committedOpen).toEqual(money('60000', ILS));
    expect(cost.estimatedFinalCost).toEqual(money('100000', ILS));
  });

  it('bill lower/higher than PO: under-bill settles to bill actual; over-bill closes commitment', () => {
    const under = consumeAmountForPostedPoBill({
      openCommitmentAmount: '100000',
      billTotal: '92000',
      currency: ILS,
    });
    expect(under.consumeAmount).toBe(money('92000', ILS).amount);

    const over = consumeAmountForPostedPoBill({
      openCommitmentAmount: '100000',
      billTotal: '110000',
      currency: ILS,
    });
    expect(over.consumeAmount).toBe(money('100000', ILS).amount);
    const closed = computeCommittedAfterConsumption({
      openAmount: '100000',
      consumeAmount: over.consumeAmount,
      currency: ILS,
    });
    expect(closed.status).toBe('closed');

    const overActual = netActualAfterVendorRecognition({
      currency: ILS,
      expenseActualTotal: '0',
      linkedExpenseAmounts: [],
      recognizedBillAmounts: ['110000'],
    });
    expect(overActual).toEqual(money('110000', ILS));
  });

  it('multiple bills accumulate recognition without double-counting commitment consume', () => {
    const first = computeCommittedAfterConsumption({
      openAmount: '100000',
      consumeAmount: consumeAmountForPostedPoBill({
        openCommitmentAmount: '100000',
        billTotal: '40000',
        currency: ILS,
      }).consumeAmount,
      currency: ILS,
    });
    const second = computeCommittedAfterConsumption({
      openAmount: first.remainingAmount,
      consumeAmount: consumeAmountForPostedPoBill({
        openCommitmentAmount: first.remainingAmount,
        billTotal: '52000',
        currency: ILS,
      }).consumeAmount,
      currency: ILS,
    });
    expect(second.remainingAmount).toBe(money('8000', ILS).amount);

    const actual = netActualAfterVendorRecognition({
      currency: ILS,
      expenseActualTotal: '0',
      linkedExpenseAmounts: [],
      recognizedBillAmounts: ['40000', '52000'],
    });
    expect(actual).toEqual(money('92000', ILS));

    const forecast = computeForecastFinalCost({
      actualCostToDate: actual,
      remainingCommitments: money(second.remainingAmount, ILS),
      expectedRemainingCost: zeroMoney(ILS),
    });
    expect(forecast).toEqual(money('100000', ILS));
  });

  it('void/credit-equivalent (void) bills do not recognize actual', () => {
    expect(isVendorBillExcludedFromActual('void')).toBe(true);
    const actual = netActualAfterVendorRecognition({
      currency: ILS,
      expenseActualTotal: '0',
      linkedExpenseAmounts: [],
      recognizedBillAmounts: [], // void excluded upstream
    });
    expect(actual).toEqual(zeroMoney(ILS));
  });

  it('expense linked to same bill does not double-count', () => {
    // Expense 92k finalized + bill 92k linked → count bill once.
    const actual = netActualAfterVendorRecognition({
      currency: ILS,
      expenseActualTotal: '92000',
      linkedExpenseAmounts: ['92000'],
      recognizedBillAmounts: ['92000'],
    });
    expect(actual).toEqual(money('92000', ILS));

    // Unlinked expense + bill → both count (distinct obligations).
    const both = netActualAfterVendorRecognition({
      currency: ILS,
      expenseActualTotal: '10000',
      linkedExpenseAmounts: [],
      recognizedBillAmounts: ['92000'],
    });
    expect(both).toEqual(money('102000', ILS));
  });

  it('payment path never adds cost on top of recognized bill', () => {
    expect(isVendorPaymentRecognizedActual()).toBe(false);
    const cost = withCommittedAndApPayable(
      withRecognizedVendorBills(emptyCostPosition(ILS), money('92000', ILS)),
      zeroMoney(ILS),
      money('92000', ILS), // cash payable
      zeroMoney(ILS),
    );
    // Paying the bill would reduce cash payable, not Actual / Forecast.
    expect(cost.actualCostToDate).toEqual(money('92000', ILS));
    expect(cost.estimatedFinalCost).toEqual(money('92000', ILS));
  });

  it('skips match-time commitment consume when bill header already linked the PO', () => {
    expect(
      shouldConsumeCommitmentOnMatchAccept({
        billPurchaseOrderId: 'po-1',
        matchPurchaseOrderId: 'po-1',
      }),
    ).toBe(false);
    expect(
      shouldConsumeCommitmentOnMatchAccept({
        billPurchaseOrderId: null,
        matchPurchaseOrderId: 'po-1',
      }),
    ).toBe(true);
  });

  it('forbids Actual=0 and Commitment=0 while a recognized bill exists', () => {
    const broken = composeVendorForecastExposure({
      currency: ILS,
      actualCostToDate: '0',
      remainingCommitment: '0',
    });
    expect(broken.losesKnownCost).toBe(true);

    const fixed = composeVendorForecastExposure({
      currency: ILS,
      actualCostToDate: '92000',
      remainingCommitment: '0',
    });
    expect(fixed.losesKnownCost).toBe(false);
    expect(fixed.forecastFinalCost).toEqual(money('92000', ILS));
  });
});
