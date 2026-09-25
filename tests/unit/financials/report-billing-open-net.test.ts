import { describe, expect, it } from 'vitest';
import { computeRecordRevenuePosition } from '@/modules/billing/domain/revenue-position';
import { reportBillingOpenNet } from '@/modules/financials/domain/report-billing-open-net';
import {
  emptyOrganizationBillingReportAggregates,
  mapOrganizationBillingReportAggregateRow,
} from '@/modules/financials/data/billing.repository';
import { money } from '@/shared/money';

const ils = (amount: string) => money(amount, 'ILS');

function expectMatchesRevenuePosition(input: Parameters<typeof reportBillingOpenNet>[0]) {
  const aggregated = reportBillingOpenNet(input);
  const position = computeRecordRevenuePosition(
    {
      kind: input.kind,
      status: input.status,
      subtotalAmount: input.subtotalAmount,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      retentionHeldRemaining: input.retentionHeldRemaining,
      payments: input.payments,
    },
    'ILS',
  );
  expect(aggregated?.amount ?? null).toBe(position?.open.net.amount ?? null);
}

describe('report billing open net', () => {
  it('matches revenue-position open net for the sums the report aggregate uses', () => {
    expectMatchesRevenuePosition({
      kind: 'invoice',
      status: 'finalized',
      subtotalAmount: ils('100'),
      taxAmount: null,
      totalAmount: ils('100'),
      retentionHeldRemaining: ils('0'),
      payments: [],
    });

    expectMatchesRevenuePosition({
      kind: 'invoice',
      status: 'finalized',
      subtotalAmount: ils('100'),
      taxAmount: ils('17'),
      totalAmount: ils('117'),
      retentionHeldRemaining: ils('0'),
      payments: [{ amount: ils('40'), amountBasis: 'net', status: 'recorded' }],
    });

    expectMatchesRevenuePosition({
      kind: 'invoice',
      status: 'finalized',
      subtotalAmount: ils('100'),
      taxAmount: ils('17'),
      totalAmount: ils('117'),
      retentionHeldRemaining: ils('10'),
      payments: [{ amount: ils('58.5'), amountBasis: 'gross', status: 'recorded' }],
    });

    expectMatchesRevenuePosition({
      kind: 'credit_note',
      status: 'finalized',
      subtotalAmount: ils('25'),
      taxAmount: ils('4.25'),
      totalAmount: ils('29.25'),
      retentionHeldRemaining: ils('0'),
      payments: [],
    });

    expectMatchesRevenuePosition({
      kind: 'invoice',
      status: 'finalized',
      subtotalAmount: ils('100'),
      taxAmount: null,
      totalAmount: ils('100'),
      retentionHeldRemaining: ils('10'),
      payments: [{ amount: ils('100'), amountBasis: 'net', status: 'recorded' }],
    });

    expectMatchesRevenuePosition({
      kind: 'invoice',
      status: 'finalized',
      subtotalAmount: ils('100'),
      taxAmount: null,
      totalAmount: ils('100'),
      retentionHeldRemaining: ils('0'),
      payments: [
        { amount: ils('120'), amountBasis: 'net', status: 'recorded' },
        { amount: ils('5'), amountBasis: 'net', status: 'void' },
      ],
    });

    expectMatchesRevenuePosition({
      kind: 'invoice',
      status: 'draft',
      subtotalAmount: ils('100'),
      taxAmount: null,
      totalAmount: ils('100'),
      retentionHeldRemaining: ils('0'),
      payments: [],
    });

    expectMatchesRevenuePosition({
      kind: 'retention_release',
      status: 'finalized',
      subtotalAmount: ils('15'),
      taxAmount: null,
      totalAmount: ils('15'),
      retentionHeldRemaining: ils('0'),
      payments: [],
    });
  });
});

describe('organization billing report aggregate row', () => {
  it('returns zero buckets when the query has no row', () => {
    expect(mapOrganizationBillingReportAggregateRow(undefined)).toEqual(
      emptyOrganizationBillingReportAggregates(),
    );
  });

  it('keeps summed totals and counts from the aggregate row', () => {
    const mapped = mapOrganizationBillingReportAggregateRow({
      aging_current_total: '-10.000000',
      aging_current_count: '2',
      aging_days_1_30_total: '40',
      aging_days_1_30_count: 1,
      aging_days_31_60_total: '0',
      aging_days_31_60_count: 0,
      aging_days_61_90_total: '0',
      aging_days_61_90_count: 0,
      aging_days_90_plus_total: '5',
      aging_days_90_plus_count: '1',
      cash_overdue_total: '45',
      cash_overdue_count: 2,
      cash_next_7_total: '0',
      cash_next_7_count: 0,
      cash_next_30_total: '0',
      cash_next_30_count: 0,
      cash_next_60_total: '0',
      cash_next_60_count: 0,
      cash_next_90_total: '0',
      cash_next_90_count: 0,
      cash_later_total: '0',
      cash_later_count: 0,
      cash_undated_total: '-10',
      cash_undated_count: 1,
    });

    expect(mapped.aging.current).toEqual({ total: '-10.000000', count: 2 });
    expect(mapped.aging.days_1_30).toEqual({ total: '40', count: 1 });
    expect(mapped.aging.days_90_plus.count).toBe(1);
    expect(mapped.incoming.overdue).toEqual({ total: '45', count: 2 });
    expect(mapped.incoming.undated).toEqual({ total: '-10', count: 1 });
  });
});
