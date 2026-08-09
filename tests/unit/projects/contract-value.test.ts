import { describe, expect, it } from 'vitest';
import {
  computeApprovedChangesTotal,
  computeCurrentContractValue,
  findOriginalValueEvent,
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
});
