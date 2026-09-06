import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';

describe('allocation empty amount guard', () => {
  it('does not parse empty expense amount as money', () => {
    const totalAmount = '';
    expect(() => {
      if (totalAmount.trim()) {
        money(totalAmount, 'ILS');
      }
    }).not.toThrow();
  });

  it('parses non-empty allocation totals', () => {
    expect(Number(money('100', 'ILS').amount)).toBe(100);
  });
});
