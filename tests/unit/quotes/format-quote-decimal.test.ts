import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatQuoteDisplayDecimal,
  formatQuoteDisplayPercent,
} from '@/modules/quotes/ui/format-quote-decimal';

describe('formatQuoteDisplayDecimal', () => {
  it('shows exactly two fraction digits', () => {
    expect(formatQuoteDisplayDecimal('1.000000')).toBe('1.00');
    expect(formatQuoteDisplayDecimal('1')).toBe('1.00');
    expect(formatQuoteDisplayDecimal('1.2')).toBe('1.20');
    expect(formatQuoteDisplayDecimal('1.005')).toBe('1.01');
    expect(formatQuoteDisplayDecimal('1.995')).toBe('2.00');
    expect(formatQuoteDisplayPercent('5.000000')).toBe('5.00%');
    expect(formatQuoteDisplayPercent(null)).toBe('-');
    expect(formatQuoteDisplayDecimal('')).toBe('');
  });
});

describe('quote detail mobile markup', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/app/[locale]/(app)/quotes/[quoteId]/page.tsx'),
    'utf8',
  );

  it('wraps actions and uses line cards below md without page overflow clipping', () => {
    expect(page).toContain('flex-wrap');
    expect(page).toContain('min-w-0');
    expect(page).toContain('md:hidden');
    expect(page).toContain('md:block');
    expect(page).toContain('break-words');
    expect(page).not.toContain('overflow-x-auto');
    expect(page).not.toContain('overflow-x-hidden');
    expect(page).toContain('QuotePrintButton');
    expect(page).toContain('PrepareMessageLink');
    expect(page).toContain('ReportDownloadButtons');
    expect(page).toContain("t('detail.preview')");
    expect(page).toContain('hidePreview');
    expect(page).toContain('quantity: line.quantity');
  });
});
