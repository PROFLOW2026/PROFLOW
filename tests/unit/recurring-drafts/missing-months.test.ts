import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  listMissingOccurrenceMonths,
  missingMonthRange,
  nextRunDateAfterRetro,
  retroMonthRangeFromStart,
} from '@/modules/recurring-drafts/domain/missing-months';
import { parseStoredPayloadLenient } from '@/modules/recurring-drafts/application/parse-payload';

describe('recurring draft missing months', () => {
  it('lists inclusive months from start through today', () => {
    const range = retroMonthRangeFromStart('2026-01-01', '2026-08-29');
    expect(range?.count).toBe(8);
    expect(range?.fromYearMonth).toBe('2026-01');
    expect(range?.toYearMonth).toBe('2026-08');
  });

  it('detects missing occurrence months', () => {
    const expected = retroMonthRangeFromStart('2026-01-01', '2026-06-15')!.months;
    const missing = missingMonthRange(expected, ['2026-01', '2026-03']);
    expect(missing?.fromYearMonth).toBe('2026-02');
    expect(missing?.toYearMonth).toBe('2026-06');
    expect(missing?.count).toBe(4);
    expect(listMissingOccurrenceMonths(expected, ['2026-01'])).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('advances next run to the month after retro', () => {
    const next = nextRunDateAfterRetro('2026-08', '2026-01-01', 'monthly', 1);
    expect(next).toBe('2026-09-01');
  });
});

describe('parseStoredPayloadLenient', () => {
  it('coerces legacy numeric amounts and missing lines', () => {
    const payload = parseStoredPayloadLenient('expense', {
      amount: 2500,
      currency: 'ils',
      supplierName: 'Office landlord',
    });
    expect(payload.kind).toBe('expense');
    if (payload.kind === 'expense') {
      expect(payload.data.amount).toBe('2500.00');
      expect(payload.data.currency).toBe('ILS');
      expect(payload.data.supplierName).toBe('Office landlord');
    }
  });

  it('synthesizes vendor bill lines for legacy payloads', () => {
    const payload = parseStoredPayloadLenient('vendor_bill', {
      vendorId: '01900000-0000-7000-8000-0000000000bb',
      currency: 'ILS',
      totalAmount: '80',
    });
    expect(payload.kind).toBe('vendor_bill');
    if (payload.kind === 'vendor_bill') {
      expect(payload.data.lines.length).toBeGreaterThan(0);
    }
  });

  it('preserves vat mode on expense payloads', () => {
    const payload = parseStoredPayloadLenient('expense', {
      amount: '100.00',
      currency: 'ILS',
      vatMode: 'exclusive',
    });
    if (payload.kind === 'expense') {
      expect(payload.data.vatMode).toBe('exclusive');
    }
  });
});

describe('safe date formatting tolerance', () => {
  it('accepts year-month amount version dates via coerce path', async () => {
    const { formatSafeBusinessDate } = await import(
      '@/modules/recurring-drafts/domain/safe-dates'
    );
    expect(formatSafeBusinessDate('2026-01', 'he-IL', '—')).not.toBe('—');
    expect(formatSafeBusinessDate(businessDate('2026-01-15'), 'he-IL', '—')).toMatch(/2026/);
  });
});
