import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money/money';
import { SUBCONTRACT_VALUE_EVENT_KINDS } from '@/modules/vendors/domain/subcontract-types';
import {
  computeApprovedSubcontractChanges,
  computeCurrentSubcontractValue,
  computeSubcontractValuePosition,
  signedSubcontractChangeAmount,
} from '@/modules/vendors/domain/subcontract-value';
import type { SubcontractValueEventRecord } from '@/modules/vendors/domain/subcontract-types';

const CURRENCY = 'ILS';

function event(
  kind: SubcontractValueEventRecord['kind'],
  amount: string,
): SubcontractValueEventRecord {
  return {
    id: `evt-${kind}-${amount}`,
    organizationId: 'org-1',
    subcontractId: 'sub-1',
    kind,
    amount,
    currency: CURRENCY,
    effectiveDate: '2026-01-01',
    reason: null,
    actorUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('subcontract value arithmetic', () => {
  it('original plus approved change equals current', () => {
    const events = [event('original', '100000.000000'), event('change_order', '15000.000000')];

    expect(computeCurrentSubcontractValue(events, CURRENCY)).toEqual(money('115000', CURRENCY));
    expect(computeApprovedSubcontractChanges(events, CURRENCY)).toEqual(money('15000', CURRENCY));

    const position = computeSubcontractValuePosition({
      events,
      currency: CURRENCY,
      originalValueFallback: '100000.000000',
    });
    expect(position.originalAmount).toEqual(money('100000', CURRENCY));
    expect(position.currentAmount).toEqual(money('115000', CURRENCY));
  });

  it('sums original, change orders, and adjustments without mutating original', () => {
    const events = [
      event('original', '200000.000000'),
      event('change_order', '12000.000000'),
      event('change_order', '-8000.000000'),
      event('adjustment', '500.000000'),
    ];

    const position = computeSubcontractValuePosition({
      events,
      currency: CURRENCY,
      originalValueFallback: null,
    });

    expect(position.originalAmount).toEqual(money('200000', CURRENCY));
    expect(position.currentAmount).toEqual(money('204500', CURRENCY));
    expect(events.find((row) => row.kind === 'original')?.amount).toBe('200000.000000');
  });

  it('pending must not exist as a mutating current event kind', () => {
    expect(SUBCONTRACT_VALUE_EVENT_KINDS).toEqual(['original', 'change_order', 'adjustment']);
    expect((SUBCONTRACT_VALUE_EVENT_KINDS as readonly string[]).includes('pending')).toBe(false);

    const events = [event('original', '50000.000000')];
    const pendingProposal = { status: 'pending', amount: '99999.000000' };

    expect(computeCurrentSubcontractValue(events, CURRENCY)).toEqual(money('50000', CURRENCY));
    expect(computeCurrentSubcontractValue(events, CURRENCY)).not.toEqual(
      money(pendingProposal.amount, CURRENCY),
    );
  });

  it('signed reductions subtract from current', () => {
    const reduction = signedSubcontractChangeAmount('reduction', money('2500', CURRENCY));
    const events = [event('original', '10000.000000'), event('change_order', reduction.amount)];
    expect(computeCurrentSubcontractValue(events, CURRENCY)).toEqual(money('7500', CURRENCY));
  });
});
