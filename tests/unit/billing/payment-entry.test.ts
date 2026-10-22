import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import { businessDate } from '@/shared/dates';
import {
  displayedCollectibleOutstanding,
  fillOutstandingDisplay,
  isBillingPaymentMethodKey,
  labelForStoredPaymentMethod,
  netStringForPaymentEntry,
} from '@/modules/billing/domain/payment-entry';
import { deriveCollectionStatusFromOpen } from '@/modules/billing/domain/revenue-position';
import { collectionAlertStillOpen } from '@/modules/billing/application/settle-collection-alerts';
import { cashFlowRiskLegOpen } from '@/modules/command-center/data/collect-next-gen';
import { mergeShellAttentionCount } from '@/modules/notifications/application/attention-badge';

const ILS = 'ILS';

const invoice = {
  totalAmount: money('118', ILS),
  subtotalAmount: money('100', ILS),
  taxAmount: money('18', ILS),
  outstandingAmount: money('100', ILS),
  outstandingGrossAmount: money('118', ILS),
};

describe('payment entry', () => {
  it('defaults a full including-VAT balance to the exact stored net', () => {
    expect(fillOutstandingDisplay(invoice, 'gross')).toBe('118.00');
    expect(
      netStringForPaymentEntry({
        entered: '118.00',
        basis: 'gross',
        currency: ILS,
        invoice,
      }),
    ).toBe(money('100', ILS).amount);
  });

  it('keeps a partial including-VAT amount editable and converts with the invoice rate', () => {
    const net = netStringForPaymentEntry({
      entered: '59.00',
      basis: 'gross',
      currency: ILS,
      invoice,
    });
    expect(net).toBeTruthy();
    expect(Number(net)).toBeCloseTo(50, 2);
  });

  it('fills the net balance when the entry basis is before VAT', () => {
    expect(fillOutstandingDisplay(invoice, 'net')).toBe('100.00');
    expect(
      netStringForPaymentEntry({
        entered: '40.00',
        basis: 'net',
        currency: ILS,
        invoice,
      }),
    ).toBe(money('40', ILS).amount);
  });

  it('leaves legacy free-text payment methods readable and maps new keys', () => {
    const labels = {
      cash: 'מזומן',
      check: 'צ׳ק',
      bank_transfer: 'העברה בנקאית',
      credit_card: 'כרטיס אשראי',
      other: 'אחר',
    };
    expect(isBillingPaymentMethodKey('cash')).toBe(true);
    expect(labelForStoredPaymentMethod('cash', labels)).toBe('מזומן');
    expect(labelForStoredPaymentMethod('העברה', labels)).toBe('העברה');
    expect(labelForStoredPaymentMethod('  ', labels)).toBeNull();
  });
});

describe('collection alerts after payment', () => {
  const today = businessDate('2026-10-22');
  const due = businessDate('2026-10-01');

  it('treats a display-zero balance as paid so it is not actionable', () => {
    const dust = {
      net: money('0.004', ILS),
      vat: money('0.001', ILS),
      gross: money('0.004', ILS),
    };
    const paid = {
      net: money('100', ILS),
      vat: money('18', ILS),
      gross: money('118', ILS),
    };
    expect(deriveCollectionStatusFromOpen(dust, paid, due, today, 'finalized')).toBe('paid');
    expect(displayedCollectibleOutstanding({ outstandingAmount: dust.net, outstandingGrossAmount: dust.gross })).toBeNull();
    expect(
      collectionAlertStillOpen({
        collectionStatus: 'paid',
        outstandingAmount: dust.net,
        outstandingGrossAmount: dust.gross,
      }),
    ).toBe(false);
  });

  it('keeps a partial balance that still displays above zero', () => {
    expect(
      collectionAlertStillOpen({
        collectionStatus: 'partial',
        outstandingAmount: money('25.50', ILS),
        outstandingGrossAmount: money('30.09', ILS),
      }),
    ).toBe(true);
    expect(cashFlowRiskLegOpen(money('0.004', ILS))).toBe(false);
    expect(cashFlowRiskLegOpen(money('30.09', ILS))).toBe(true);
  });
});

describe('shell notification badge', () => {
  it('raises a stale snapshot when a new persisted notification arrives', () => {
    expect(
      mergeShellAttentionCount({
        persistedUnread: 4,
        snapshot: { activeAttentionCount: 3 },
        unreadCreatedAfterSnapshot: 1,
        clearedAfterSnapshot: 0,
      }),
    ).toBe(4);
  });

  it('drops a stale snapshot when a notification is read or resolved', () => {
    expect(
      mergeShellAttentionCount({
        persistedUnread: 1,
        snapshot: { activeAttentionCount: 5 },
        unreadCreatedAfterSnapshot: 0,
        clearedAfterSnapshot: 2,
      }),
    ).toBe(3);
  });

  it('uses the live unread count when no snapshot exists', () => {
    expect(
      mergeShellAttentionCount({
        persistedUnread: 2,
        snapshot: null,
        unreadCreatedAfterSnapshot: 0,
        clearedAfterSnapshot: 0,
      }),
    ).toBe(2);
  });
});
