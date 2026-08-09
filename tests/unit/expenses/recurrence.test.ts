import { describe, expect, it } from 'vitest';
import { encodeRecurrenceRule, decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';

describe('expense recurrence', () => {
  it('encodes standard cadences', () => {
    expect(encodeRecurrenceRule('monthly')).toBe('monthly');
    expect(encodeRecurrenceRule('one_time')).toBeNull();
  });

  it('encodes custom cadence with label', () => {
    expect(encodeRecurrenceRule('custom', 'Every 6 weeks')).toBe('custom:Every 6 weeks');
  });

  it('decodes stored rules', () => {
    expect(decodeRecurrenceRule('quarterly')).toEqual({ cadence: 'quarterly', customLabel: null });
    expect(decodeRecurrenceRule('custom:Bi-weekly')).toEqual({
      cadence: 'custom',
      customLabel: 'Bi-weekly',
    });
    expect(decodeRecurrenceRule(null)).toEqual({ cadence: 'one_time', customLabel: null });
  });
});
