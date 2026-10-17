import { describe, expect, it } from 'vitest';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';

describe('formatWorkHoursValue', () => {
  it('shows workforce hours with two fraction digits', () => {
    expect(formatWorkHoursValue('3.000000')).toBe('3.00');
    expect(formatWorkHoursValue('3.500000')).toBe('3.50');
    expect(formatWorkHoursValue('7.250000')).toBe('7.25');
  });
});
