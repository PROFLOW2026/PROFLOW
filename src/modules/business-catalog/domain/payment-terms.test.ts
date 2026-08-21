import { describe, expect, it } from 'vitest';
import {
  deriveDueDate,
  parsePaymentTermMetadata,
  resolveApPaymentTermId,
  resolveArPaymentTermId,
  resolveInheritedPaymentTermId,
  suggestDueDateFromPaymentTerm,
} from './types';

describe('payment term due date derivation', () => {
  it('derives net days', () => {
    expect(deriveDueDate('2026-01-01', { strategy: 'net_days', netDays: 30 })).toBe('2026-01-31');
  });

  it('derives immediate', () => {
    expect(deriveDueDate('2026-03-15', { strategy: 'immediate' })).toBe('2026-03-15');
  });

  it('derives end of month', () => {
    expect(deriveDueDate('2026-02-10', { strategy: 'end_of_month' })).toBe('2026-02-28');
  });

  it('derives eom plus days', () => {
    expect(deriveDueDate('2026-01-05', { strategy: 'eom_plus_days', eomOffsetDays: 30 })).toBe(
      '2026-03-02',
    );
  });

  it('returns null for milestone/custom', () => {
    expect(deriveDueDate('2026-01-01', { strategy: 'milestone' })).toBeNull();
    expect(deriveDueDate('2026-01-01', { strategy: 'custom' })).toBeNull();
  });

  it('parses metadata', () => {
    expect(parsePaymentTermMetadata({ strategy: 'net_days', netDays: 14 })).toEqual({
      strategy: 'net_days',
      netDays: 14,
      eomOffsetDays: undefined,
    });
    expect(parsePaymentTermMetadata({ strategy: 'nope' })).toBeNull();
  });

  it('inherits selected over party over org', () => {
    expect(
      resolveInheritedPaymentTermId({
        selectedId: 'a',
        partyDefaultId: 'b',
        orgDefaultId: 'c',
      }),
    ).toBe('a');
    expect(
      resolveInheritedPaymentTermId({
        selectedId: null,
        partyDefaultId: 'b',
        orgDefaultId: 'c',
      }),
    ).toBe('b');
    expect(
      resolveInheritedPaymentTermId({
        selectedId: null,
        partyDefaultId: null,
        orgDefaultId: 'c',
      }),
    ).toBe('c');
  });

  it('never rewrites an existing due date', () => {
    expect(
      suggestDueDateFromPaymentTerm({
        baseDateIso: '2026-01-01',
        dueDate: '2026-02-15',
        term: { strategy: 'net_days', netDays: 30 },
      }),
    ).toBe('2026-02-15');
    expect(
      suggestDueDateFromPaymentTerm({
        baseDateIso: '2026-01-01',
        dueDate: null,
        term: { strategy: 'net_days', netDays: 30 },
      }),
    ).toBe('2026-01-31');
  });

  it('subcontract wins over PO on AP bills', () => {
    expect(
      resolveApPaymentTermId({
        explicitId: null,
        subcontractTermId: 'sub',
        purchaseOrderTermId: 'po',
        vendorDefaultId: null,
        orgDefaultId: null,
      }),
    ).toBe('sub');
  });

  it('AR uses contract before client default', () => {
    expect(
      resolveArPaymentTermId({
        explicitId: null,
        contractTermId: 'contract',
        clientDefaultId: 'client',
        orgDefaultId: null,
      }),
    ).toBe('contract');
  });
});
