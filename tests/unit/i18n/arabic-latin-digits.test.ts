import { describe, expect, it } from 'vitest';
import type { BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import {
  ARABIC_LATIN_DIGITS_INTL_LOCALE,
  buildNextIntlFormats,
  intlDateTimeFormat,
  resolveIntlLocale,
  resolveIntlTimeLocale,
} from '@/shared/i18n/intl-locale';
import { formatMoney, formatNumber, formatPercent } from '@/shared/money/format';

const EASTERN_ARABIC_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/;

function expectLatinDigitsOnly(value: string): void {
  expect(value, `expected Latin digits only, got: ${value}`).not.toMatch(EASTERN_ARABIC_DIGIT);
  expect(value).toMatch(/\d/);
}

describe('Arabic locale Latin digits', () => {
  it('resolves Arabic UI locale to ar-IL-u-nu-latn', () => {
    expect(resolveIntlLocale('ar')).toBe(ARABIC_LATIN_DIGITS_INTL_LOCALE);
    expect(resolveIntlTimeLocale('ar')).toBe(ARABIC_LATIN_DIGITS_INTL_LOCALE);
  });

  it('does not change Hebrew, English, or Russian Intl locales', () => {
    expect(resolveIntlLocale('he-IL')).toBe('he-IL');
    expect(resolveIntlLocale('en')).toBe('en-GB');
    expect(resolveIntlLocale('ru')).toMatch(/^ru-/);
    expect(resolveIntlTimeLocale('en')).toBe('en');
  });

  it('formats money, numbers, and percentages with Latin digits', () => {
    expectLatinDigitsOnly(formatNumber(470, 'ar'));
    expectLatinDigitsOnly(formatNumber(28, 'ar'));
    expectLatinDigitsOnly(formatPercent(28, 'ar'));
    expectLatinDigitsOnly(formatMoney({ amount: '150916.50', currency: 'ILS' }, 'ar'));
  });

  it('formats business dates with Latin digits', () => {
    expectLatinDigitsOnly(formatBusinessDate('2026-09-18' as BusinessDate, 'ar', 'short'));
    expectLatinDigitsOnly(intlDateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date('2026-09-18')));
  });

  it('adds numberingSystem latn to next-intl preset formats for Arabic only', () => {
    expect(buildNextIntlFormats('ar').number.tabular).toEqual({
      useGrouping: true,
      numberingSystem: 'latn',
    });
    expect(buildNextIntlFormats('en').number.tabular).toEqual({ useGrouping: true });
  });
});
