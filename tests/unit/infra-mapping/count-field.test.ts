import { describe, expect, it } from 'vitest';
import { resolveCountDraft, sanitizeCountDraft } from '@/modules/infra-mapping/ui/count-field';

describe('count field draft', () => {
  it('lets the field be emptied and never forces a 0 back', () => {
    expect(sanitizeCountDraft('')).toBe('');
    expect(resolveCountDraft('', 0, 60, false)).toBeNull();
  });

  it('drops leading zeros so a new number can simply be typed over a 0', () => {
    expect(sanitizeCountDraft('05')).toBe('5');
    expect(sanitizeCountDraft('00')).toBe('0');
    expect(sanitizeCountDraft('0')).toBe('0');
  });

  it('keeps digits only: no negatives, decimals, exponents or letters', () => {
    expect(sanitizeCountDraft('-3')).toBe('3');
    expect(sanitizeCountDraft('2.5')).toBe('25');
    expect(sanitizeCountDraft('1e3')).toBe('13');
    expect(sanitizeCountDraft('abc')).toBe('');
  });

  it('accepts 0 where 0 is valid and only positives where a quantity is required', () => {
    expect(resolveCountDraft('0', 0, 60, false)).toBe(0);
    expect(resolveCountDraft('0', 1, 50, false)).toBeNull();
    expect(resolveCountDraft('3', 1, 50, false)).toBe(3);
  });

  it('clamps above the maximum and normalizes an empty or too-small draft only when the field is left', () => {
    expect(resolveCountDraft('99', 0, 60, false)).toBe(60);
    expect(resolveCountDraft('', 0, 60, true)).toBe(0);
    expect(resolveCountDraft('', 1, 50, true)).toBe(1);
    expect(resolveCountDraft('0', 1, 50, true)).toBe(1);
  });
});
