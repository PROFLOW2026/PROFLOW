import { describe, expect, it } from 'vitest';
import {
  LEGACY_DATE_RANGE_PRESETS,
  STANDARD_DATE_RANGE_PRESETS,
} from '@/components/patterns/date-range-selector';

describe('DateRangeSelector presets', () => {
  it('exposes the owner-approved default preset set', () => {
    expect([...STANDARD_DATE_RANGE_PRESETS]).toEqual(['thisWeek', 'thisMonth', 'thisYear']);
  });

  it('keeps legacy presets available for staged rollout', () => {
    expect(LEGACY_DATE_RANGE_PRESETS).toContain('today');
    expect(LEGACY_DATE_RANGE_PRESETS).toContain('last30Days');
    expect(LEGACY_DATE_RANGE_PRESETS).not.toContain('custom');
  });
});
