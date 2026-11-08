import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acceptApAmountInput, seedApAmountInput } from '@/modules/ap/domain/accept-amount-input';
import { formatMoneyString } from '@/shared/money/format';
import { money } from '@/shared/money/money';

describe('AP amount display scale', () => {
  it('stores extra precision as two decimals that the shared formatter shows', () => {
    const stored = acceptApAmountInput('11.123', 'ILS');
    expect(stored).toBe('11.12');
    expect(formatMoneyString(stored, 'ILS', 'he-IL')).toBe(formatMoneyString('11.12', 'ILS', 'he-IL'));
    expect(seedApAmountInput(stored, 'ILS')).toBe(stored);
    expect(acceptApAmountInput('1234.567', 'ILS')).toBe('1234.57');
    expect(acceptApAmountInput('0.005', 'ILS')).toBe('0.01');
    expect(acceptApAmountInput('19.999', 'ILS')).toBe('20.00');
    expect(money(acceptApAmountInput('19.999', 'ILS'), 'ILS').amount).toBe('20.000000');
  });

  it('seeds a stored amount to the same two decimals the field keeps', () => {
    expect(seedApAmountInput('52000.000000', 'ILS')).toBe('52000.00');
    expect(seedApAmountInput('52.500000', 'ILS')).toBe('52.50');
    expect(seedApAmountInput('547.457627', 'ILS')).toBe('547.46');
    expect(formatMoneyString(seedApAmountInput('547.457627', 'ILS'), 'ILS', 'en')).toBe(
      formatMoneyString('547.46', 'ILS', 'en'),
    );
  });

  it('leaves an in-progress entry unchanged', () => {
    expect(acceptApAmountInput('', 'ILS')).toBe('');
    expect(acceptApAmountInput('11.', 'ILS')).toBe('11.');
    expect(acceptApAmountInput('11.1', 'ILS')).toBe('11.1');
    expect(acceptApAmountInput('11.10', 'ILS')).toBe('11.10');
  });

  it('rounds the employee AP draft through the same two-decimal helper', () => {
    const source = readFileSync('src/app/[locale]/employee/(shell)/ap/actions.ts', 'utf8');
    expect(source).toContain('acceptApAmountInput(amount, currency)');
    expect(source).toContain('totalAmount: storedAmount');
  });
});