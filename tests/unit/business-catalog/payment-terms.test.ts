import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_TERM_CATALOG_KEY,
  parseOrgDefaultPaymentTermKey,
} from '@/modules/business-catalog/application/payment-term-defaults';
import {
  deriveDueDate,
  parsePaymentTermMetadata,
  resolveApPaymentTermId,
  resolveArPaymentTermId,
  resolveDocumentPaymentTermId,
  resolveInheritedPaymentTermId,
  suggestDueDateFromPaymentTerm,
} from '@/modules/business-catalog/domain/types';

describe('org default payment term key', () => {
  it('parses json string setting values', () => {
    expect(parseOrgDefaultPaymentTermKey('net_30')).toBe('net_30');
    expect(parseOrgDefaultPaymentTermKey('')).toBeNull();
    expect(parseOrgDefaultPaymentTermKey(null)).toBeNull();
  });

  it('uses net_30 as the bootstrap catalog key', () => {
    expect(DEFAULT_PAYMENT_TERM_CATALOG_KEY).toBe('net_30');
  });
});

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

  it('parses metadata including migration aliases', () => {
    expect(parsePaymentTermMetadata({ strategy: 'net_days', netDays: 14 })).toEqual({
      strategy: 'net_days',
      netDays: 14,
      eomOffsetDays: undefined,
    });
    expect(parsePaymentTermMetadata({ strategy: 'net', netDays: 30 })).toEqual({
      strategy: 'net_days',
      netDays: 30,
      eomOffsetDays: undefined,
    });
    expect(parsePaymentTermMetadata({ strategy: 'due_on_receipt' })).toEqual({
      strategy: 'immediate',
      netDays: undefined,
      eomOffsetDays: undefined,
    });
    expect(parsePaymentTermMetadata({ strategy: 'eom_offset', eomOffsetDays: 15 })).toEqual({
      strategy: 'eom_plus_days',
      netDays: undefined,
      eomOffsetDays: 15,
    });
    expect(parsePaymentTermMetadata({ strategy: 'nope' })).toBeNull();
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

  it('preserves explicit due date even when term metadata would differ', () => {
    expect(
      suggestDueDateFromPaymentTerm({
        baseDateIso: '2026-06-01',
        dueDate: '2026-01-01',
        term: { strategy: 'immediate' },
      }),
    ).toBe('2026-01-01');
  });
});

describe('AR payment term inheritance', () => {
  it('follows billing → contract → client → org', () => {
    expect(
      resolveArPaymentTermId({
        explicitId: 'bill',
        contractTermId: 'contract',
        clientDefaultId: 'client',
        orgDefaultId: 'org',
      }),
    ).toBe('bill');
    expect(
      resolveArPaymentTermId({
        explicitId: null,
        contractTermId: 'contract',
        clientDefaultId: 'client',
        orgDefaultId: 'org',
      }),
    ).toBe('contract');
    expect(
      resolveArPaymentTermId({
        explicitId: null,
        contractTermId: null,
        clientDefaultId: 'client',
        orgDefaultId: 'org',
      }),
    ).toBe('client');
    expect(
      resolveArPaymentTermId({
        explicitId: null,
        contractTermId: null,
        clientDefaultId: null,
        orgDefaultId: 'org',
      }),
    ).toBe('org');
  });
});

describe('AP payment term inheritance', () => {
  it('follows bill → subcontract → PO → vendor → org', () => {
    expect(
      resolveApPaymentTermId({
        explicitId: 'bill',
        subcontractTermId: 'sub',
        purchaseOrderTermId: 'po',
        vendorDefaultId: 'vendor',
        orgDefaultId: 'org',
      }),
    ).toBe('bill');
    expect(
      resolveApPaymentTermId({
        explicitId: null,
        subcontractTermId: 'sub',
        purchaseOrderTermId: 'po',
        vendorDefaultId: 'vendor',
        orgDefaultId: 'org',
      }),
    ).toBe('sub');
    expect(
      resolveApPaymentTermId({
        explicitId: null,
        subcontractTermId: null,
        purchaseOrderTermId: 'po',
        vendorDefaultId: 'vendor',
        orgDefaultId: 'org',
      }),
    ).toBe('po');
    expect(
      resolveApPaymentTermId({
        explicitId: null,
        subcontractTermId: null,
        purchaseOrderTermId: null,
        vendorDefaultId: 'vendor',
        orgDefaultId: 'org',
      }),
    ).toBe('vendor');
    expect(
      resolveApPaymentTermId({
        explicitId: null,
        subcontractTermId: null,
        purchaseOrderTermId: null,
        vendorDefaultId: null,
        orgDefaultId: 'org',
      }),
    ).toBe('org');
  });

  it('prefers subcontract over PO when both are linked', () => {
    expect(
      resolveApPaymentTermId({
        explicitId: null,
        subcontractTermId: 'sub-term',
        purchaseOrderTermId: 'po-term',
        vendorDefaultId: 'vendor-term',
        orgDefaultId: 'org-term',
      }),
    ).toBe('sub-term');
  });
});

describe('document / party payment term inheritance', () => {
  it('inherits selected over party over org', () => {
    expect(
      resolveDocumentPaymentTermId({
        explicitId: 'a',
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
      resolveDocumentPaymentTermId({
        explicitId: null,
        partyDefaultId: null,
        orgDefaultId: 'c',
      }),
    ).toBe('c');
  });
});
