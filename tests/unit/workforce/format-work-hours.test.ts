import { describe, expect, it } from 'vitest';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';

describe('formatWorkHoursValue', () => {
  it('strips database numeric precision for employee display', () => {
    expect(formatWorkHoursValue('3.000000')).toBe('3');
    expect(formatWorkHoursValue('3.500000')).toBe('3.5');
    expect(formatWorkHoursValue('7.250000')).toBe('7.25');
  });
});
