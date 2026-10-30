import { describe, expect, it } from 'vitest';
import {
  LEGACY_DATE_RANGE_PRESETS,
  STANDARD_DATE_RANGE_PRESETS,
  computePresetRange,
  findMatchingPreset,
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

  it('computePresetRange resolves standard presets from a fixed today', () => {
    const today = '2026-03-15';
    expect(computePresetRange('thisMonth', today)).toEqual({
      from: '2026-03-01',
      to: today,
    });
    expect(computePresetRange('thisYear', today)).toEqual({
      from: '2026-01-01',
      to: today,
    });
  });

  it('findMatchingPreset detects preset-aligned ranges', () => {
    const today = '2026-03-15';
    const month = computePresetRange('thisMonth', today);
    expect(
      findMatchingPreset(month.from, month.to, today, STANDARD_DATE_RANGE_PRESETS),
    ).toBe('thisMonth');
    expect(findMatchingPreset('2020-01-01', '2020-01-31', today, STANDARD_DATE_RANGE_PRESETS)).toBe(
      null,
    );
  });
});
