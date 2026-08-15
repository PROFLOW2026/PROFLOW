import { describe, expect, it } from 'vitest';
import { computeCommercialPosition } from '@/modules/commercial/domain/contract-value';
import { sumCommercialPositions } from '@/modules/financials/domain/aggregate-commercial';
import { money } from '@/shared/money';
import type { ContractValueEventRecord, PendingChangeInput } from '@/modules/commercial/domain/types';

const CURRENCY = 'ILS';

function event(
  contractId: string,
  kind: ContractValueEventRecord['kind'],
  amount: string,
): ContractValueEventRecord {
  return {
    id: `${contractId}-${kind}-${amount}`,
    organizationId: 'org-1',
    contractId,
    projectId: 'project-1',
    kind,
    amount,
    currency: CURRENCY,
    changeOrderId: kind === 'change_order' ? `co-${amount}` : null,
    effectiveDate: '2026-01-01',
  };
}

describe('multi-contract commercial aggregate', () => {
  it('keeps pending changes out of current on each contract and on the project sum', () => {
    const pending: PendingChangeInput[] = [
      {
        status: 'awaiting_approval',
        direction: 'addition',
        requestedAmount: '9000.000000',
        currency: CURRENCY,
        pricedAmount: null,
      },
    ];

    const position = computeCommercialPosition({
      valueEvents: [event('a', 'original', '100000.000000')],
      pendingChanges: pending,
      currency: CURRENCY,
      originalValueFallback: null,
    });

    expect(position.currentContractValue).toEqual(money('100000', CURRENCY));
    expect(position.pendingChanges).toEqual(money('9000', CURRENCY));
  });

  it('sums two contracts into the project aggregate (A + B)', () => {
    const a = computeCommercialPosition({
      valueEvents: [
        event('a', 'original', '100000.000000'),
        event('a', 'change_order', '5000.000000'),
      ],
      pendingChanges: [],
      currency: CURRENCY,
      originalValueFallback: null,
    });
    const b = computeCommercialPosition({
      valueEvents: [event('b', 'original', '40000.000000')],
      pendingChanges: [],
      currency: CURRENCY,
      originalValueFallback: null,
    });

    const aggregate = sumCommercialPositions([a, b], CURRENCY);
    expect(aggregate.originalContractValue).toEqual(money('140000', CURRENCY));
    expect(aggregate.currentContractValue).toEqual(money('145000', CURRENCY));
    expect(aggregate.approvedAdditions).toEqual(money('5000', CURRENCY));
  });

  it('grandfathers a single contract: project aggregate equals that contract', () => {
    const only = computeCommercialPosition({
      valueEvents: [
        event('primary', 'original', '250000.000000'),
        event('primary', 'change_order', '-10000.000000'),
      ],
      pendingChanges: [],
      currency: CURRENCY,
      originalValueFallback: '250000.000000',
    });

    const aggregate = sumCommercialPositions([only], CURRENCY);
    expect(aggregate).toEqual(only);
  });
});
