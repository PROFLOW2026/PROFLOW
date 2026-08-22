import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_TERM_CATALOG_KEY,
  parseOrgDefaultPaymentTermKey,
} from '@/modules/business-catalog/application/payment-term-defaults';
import {
  DEFAULT_PAYMENT_TERMS,
  deriveDueDate,
  parsePaymentTermMetadata,
  resolveApPaymentTermId,
  resolveArPaymentTermId,
  resolveDocumentPaymentTermId,
  resolveInheritedPaymentTermId,
  suggestDueDateFromPaymentTerm,
} from '@/modules/business-catalog/domain/types';
import {
  localizePaymentTermName,
  localizePaymentTermOptions,
  PAYMENT_TERM_LABELS_EN,
  PAYMENT_TERM_LABELS_HE,
} from '@/modules/business-catalog/domain/payment-term-labels';

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

describe('default payment terms catalog', () => {
  it('includes eom_90 and eom_120 as eom_plus_days', () => {
    const eom90 = DEFAULT_PAYMENT_TERMS.find((term) => term.key === 'eom_90');
    const eom120 = DEFAULT_PAYMENT_TERMS.find((term) => term.key === 'eom_120');
    expect(eom90?.metadata).toEqual({ strategy: 'eom_plus_days', eomOffsetDays: 90 });
    expect(eom120?.metadata).toEqual({ strategy: 'eom_plus_days', eomOffsetDays: 120 });
  });

  it('maps שוטף family keys to end_of_month / eom_plus_days', () => {
    expect(DEFAULT_PAYMENT_TERMS.find((term) => term.key === 'eom')?.metadata.strategy).toBe(
      'end_of_month',
    );
    for (const key of ['eom_30', 'eom_45', 'eom_60', 'eom_90', 'eom_120'] as const) {
      expect(DEFAULT_PAYMENT_TERMS.find((term) => term.key === key)?.metadata.strategy).toBe(
        'eom_plus_days',
      );
    }
  });
});

describe('payment term localization', () => {
  it('maps system keys to Hebrew labels (never English Net/EOM strings)', () => {
    expect(localizePaymentTermName('immediate', 'Immediate', 'he-IL')).toBe('מיידי');
    expect(localizePaymentTermName('eom', 'End of month', 'he-IL')).toBe('שוטף');
    expect(localizePaymentTermName('eom_30', 'EOM + 30', 'he-IL')).toBe('שוטף + 30');
    expect(localizePaymentTermName('eom_45', 'EOM + 45', 'he-IL')).toBe('שוטף + 45');
    expect(localizePaymentTermName('eom_60', 'EOM + 60', 'he-IL')).toBe('שוטף + 60');
    expect(localizePaymentTermName('eom_90', 'EOM + 90', 'he-IL')).toBe('שוטף + 90');
    expect(localizePaymentTermName('eom_120', 'EOM + 120', 'he-IL')).toBe('שוטף + 120');
    expect(localizePaymentTermName('net_30', 'Net 30', 'he-IL')).toBe('תוך 30 ימים');
    expect(localizePaymentTermName('milestone', 'Milestone-based', 'he-IL')).toBe('לפי אבן דרך');
    expect(localizePaymentTermName('custom', 'Custom', 'he-IL')).toBe('מותאם');
  });

  it('keeps sensible English labels for en locale', () => {
    expect(localizePaymentTermName('immediate', 'x', 'en')).toBe('Immediate');
    expect(localizePaymentTermName('net_30', 'x', 'en')).toBe('Net 30');
    expect(localizePaymentTermName('eom', 'x', 'en')).toBe('End of month');
    expect(localizePaymentTermName('eom_90', 'x', 'en')).toBe('EOM + 90');
  });

  it('falls back to stored name for unknown keys', () => {
    expect(localizePaymentTermName('acme_custom', 'Acme Net 10', 'he-IL')).toBe('Acme Net 10');
  });

  it('localizes option lists at map boundaries', () => {
    expect(
      localizePaymentTermOptions(
        [
          { id: '1', key: 'eom', name: 'End of month' },
          { id: '2', key: 'net_30', name: 'Net 30' },
        ],
        'he-IL',
      ),
    ).toEqual([
      { id: '1', name: 'שוטף' },
      { id: '2', name: 'תוך 30 ימים' },
    ]);
  });

  it('covers every DEFAULT_PAYMENT_TERMS key in both locale maps', () => {
    for (const term of DEFAULT_PAYMENT_TERMS) {
      expect(PAYMENT_TERM_LABELS_EN[term.key]).toBeTruthy();
      expect(PAYMENT_TERM_LABELS_HE[term.key]).toBeTruthy();
    }
  });
});

describe('payment term due date derivation', () => {
  it('derives net days', () => {
    expect(deriveDueDate('2026-01-01', { strategy: 'net_days', netDays: 30 })).toBe('2026-01-31');
  });

  it('derives immediate', () => {
    expect(deriveDueDate('2026-03-15', { strategy: 'immediate' })).toBe('2026-03-15');
  });

  it('derives end of month (שוטף)', () => {
    expect(deriveDueDate('2026-02-10', { strategy: 'end_of_month' })).toBe('2026-02-28');
  });

  it('derives eom plus days (שוטף + N)', () => {
    expect(deriveDueDate('2026-01-05', { strategy: 'eom_plus_days', eomOffsetDays: 30 })).toBe(
      '2026-03-02',
    );
  });

  it('derives eom_90 and eom_120 offsets', () => {
    expect(deriveDueDate('2026-01-05', { strategy: 'eom_plus_days', eomOffsetDays: 90 })).toBe(
      '2026-05-01',
    );
    expect(deriveDueDate('2026-01-05', { strategy: 'eom_plus_days', eomOffsetDays: 120 })).toBe(
      '2026-05-31',
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
