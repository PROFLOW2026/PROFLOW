import { describe, expect, it } from 'vitest';
import {
  changeOrderEventAmount,
  changeOrderApprovedNetAmount,
  computeApprovedAdditions,
  computeApprovedReductions,
  computeCommercialPosition,
  computeCurrentContractValue,
  computePendingChanges,
  signedChangeAmount,
} from '@/modules/commercial/domain/contract-value';
import { money } from '@/shared/money/money';
import type { ContractValueEventRecord, PendingChangeInput } from '@/modules/commercial/domain/types';

const CURRENCY = 'ILS';

function event(
  kind: ContractValueEventRecord['kind'],
  amount: string,
  changeOrderId: string | null = null,
): ContractValueEventRecord {
  return {
    id: `evt-${amount}-${kind}`,
    organizationId: 'org-1',
    contractId: 'contract-1',
    projectId: 'project-1',
    kind,
    amount,
    currency: CURRENCY,
    changeOrderId,
    effectiveDate: '2026-01-01',
  };
}

describe('contract value arithmetic', () => {
  it('sums original and signed change orders into current contract value', () => {
    const events = [
      event('original', '500000.000000'),
      event('change_order', '12000.000000', 'co-1'),
      event('change_order', '-8000.000000', 'co-2'),
    ];

    expect(computeCurrentContractValue(events, CURRENCY)).toEqual(money('504000', CURRENCY));
  });

  it('separates approved additions and reductions', () => {
    const events = [
      event('original', '500000.000000'),
      event('change_order', '12000.000000', 'co-1'),
      event('change_order', '-8000.000000', 'co-2'),
    ];

    expect(computeApprovedAdditions(events, CURRENCY)).toEqual(money('12000', CURRENCY));
    expect(computeApprovedReductions(events, CURRENCY)).toEqual(money('8000', CURRENCY));
  });

  it('orders multiple change orders without double counting', () => {
    const events = [
      event('original', '100000.000000'),
      event('change_order', '5000.000000', 'co-1'),
      event('change_order', '3000.000000', 'co-2'),
      event('change_order', '-2000.000000', 'co-3'),
    ];

    const position = computeCommercialPosition({
      valueEvents: events,
      pendingChanges: [],
      currency: CURRENCY,
      originalValueFallback: null,
    });

    expect(position.currentContractValue).toEqual(money('106000', CURRENCY));
    expect(position.approvedAdditions).toEqual(money('8000', CURRENCY));
    expect(position.approvedReductions).toEqual(money('2000', CURRENCY));
  });

  it('keeps pending changes separate from current contract value', () => {
    const events = [event('original', '500000.000000')];
    const pending: PendingChangeInput[] = [
      {
        status: 'awaiting_approval',
        direction: 'addition',
        requestedAmount: '18000.000000',
        currency: CURRENCY,
        pricedAmount: null,
      },
    ];

    const position = computeCommercialPosition({
      valueEvents: events,
      pendingChanges: pending,
      currency: CURRENCY,
      originalValueFallback: null,
    });

    expect(position.currentContractValue).toEqual(money('500000', CURRENCY));
    expect(position.pendingChanges).toEqual(money('18000', CURRENCY));
  });

  it('uses priced quote total for pending when available', () => {
    const pending: PendingChangeInput[] = [
      {
        status: 'draft',
        direction: 'addition',
        requestedAmount: '10000.000000',
        currency: CURRENCY,
        pricedAmount: '15700.000000',
      },
    ];

    expect(computePendingChanges(pending, CURRENCY)).toEqual(money('15700', CURRENCY));
  });

  it('applies reduction direction to pending and approved event amounts', () => {
    expect(
      signedChangeAmount('reduction', money('8000', CURRENCY)).amount.startsWith('-'),
    ).toBe(true);

    expect(
      changeOrderEventAmount('reduction', money('8000', CURRENCY)),
    ).toEqual(money('-8000', CURRENCY));
  });

  it('uses quote subtotal (net) for CO approval - VAT is never contract value', () => {
    expect(
      changeOrderApprovedNetAmount({
        quoteVersion: {
          subtotalAmount: '10000.000000',
          taxAmount: '1700.000000',
          totalAmount: '11700.000000',
        },
        requestedAmount: '99999.000000',
      }),
    ).toBe('10000.000000');

    expect(
      changeOrderApprovedNetAmount({
        quoteVersion: null,
        requestedAmount: '5000.000000',
      }),
    ).toBe('5000.000000');
  });

  it('ignores approved change requests when computing pending', () => {
    const pending: PendingChangeInput[] = [
      {
        status: 'approved',
        direction: 'addition',
        requestedAmount: '99999.000000',
        currency: CURRENCY,
        pricedAmount: null,
      },
    ];

    expect(computePendingChanges(pending, CURRENCY)).toEqual(money('0', CURRENCY));
  });
});
