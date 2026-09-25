import { describe, expect, it } from 'vitest';
import {
  computeApprovedChangesTotal,
  computeCurrentContractValue,
  computeHeaderCurrentContractValue,
  findOriginalValueEvent,
  isOriginalContractAmountLocked,
} from '@/modules/projects';
import type { ContractValueEventRecord } from '@/modules/projects';

const baseEvent = {
  organizationId: 'org',
  contractId: 'contract',
  projectId: 'project',
  currency: 'ILS',
  changeOrderId: null,
  reason: null,
  actorUserId: null,
  actorDisplayName: null,
  actorEmail: null,
  createdAt: new Date(),
};

describe('contract value domain', () => {
  const events: ContractValueEventRecord[] = [
    {
      ...baseEvent,
      id: '1',
      kind: 'original',
      amount: '100000.000000',
      effectiveDate: '2026-01-01',
    },
    {
      ...baseEvent,
      id: '2',
      kind: 'change_order',
      amount: '5000.000000',
      effectiveDate: '2026-02-01',
    },
    {
      ...baseEvent,
      id: '3',
      kind: 'change_order',
      amount: '-2000.000000',
      effectiveDate: '2026-03-01',
    },
  ];

  it('sums events into current contract value', () => {
    const total = computeCurrentContractValue(events, 'ILS');
    expect(total.amount).toBe('103000.000000');
    expect(total.currency).toBe('ILS');
  });

  it('sums only change_order events for approved changes', () => {
    const approved = computeApprovedChangesTotal(events, 'ILS');
    expect(approved.amount).toBe('3000.000000');
  });

  it('finds the original value event', () => {
    expect(findOriginalValueEvent(events)?.kind).toBe('original');
  });

  it('returns zero when no events exist', () => {
    const total = computeCurrentContractValue([], 'USD');
    expect(total.amount).toBe('0.000000');
  });

  it('does not lock original amount when only the original event exists', () => {
    expect(isOriginalContractAmountLocked([events[0]!])).toBe(false);
  });

  it('locks original amount once a change_order event exists', () => {
    expect(isOriginalContractAmountLocked(events)).toBe(true);
  });

  it('locks original amount for adjustment events as finalized value changes', () => {
    expect(
      isOriginalContractAmountLocked([
        events[0]!,
        { ...baseEvent, id: 'adj', kind: 'adjustment', amount: '100.000000', effectiveDate: '2026-04-01' },
      ]),
    ).toBe(true);
  });

  it('skips closed and cancelled contracts in the header current value', () => {
    const current = computeHeaderCurrentContractValue({
      currency: 'ILS',
      contracts: [
        {
          id: 'live',
          status: 'active',
          isPrimary: true,
          originalValueAmount: '100.000000',
        },
        {
          id: 'closed',
          status: 'closed',
          isPrimary: false,
          originalValueAmount: '900.000000',
        },
      ],
      events: [
        {
          ...baseEvent,
          id: 'live-original',
          contractId: 'live',
          kind: 'original',
          amount: '100.000000',
          effectiveDate: '2026-01-01',
        },
        {
          ...baseEvent,
          id: 'closed-original',
          contractId: 'closed',
          kind: 'original',
          amount: '900.000000',
          effectiveDate: '2026-01-01',
        },
      ],
    });
    expect(current.amount).toBe('100.000000');
  });
});
