import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STANDARD_WORK_END_TIME,
  DEFAULT_STANDARD_WORK_START_TIME,
  parseLaborCostDefaults,
  parseOrgStandardWorkTimePair,
  resolveOrgStandardWorkTimes,
} from '@/modules/tenancy/domain/labor-cost-defaults';

describe('org standard work times', () => {
  it('falls back to 09:00–17:00 when org times are unset', () => {
    expect(resolveOrgStandardWorkTimes(null)).toEqual({
      start: DEFAULT_STANDARD_WORK_START_TIME,
      end: DEFAULT_STANDARD_WORK_END_TIME,
    });
    expect(resolveOrgStandardWorkTimes(parseLaborCostDefaults({}))).toEqual({
      start: '09:00',
      end: '17:00',
    });
  });

  it('uses saved org times when valid', () => {
    const defaults = parseLaborCostDefaults({
      standardWorkStartTime: '07:00',
      standardWorkEndTime: '15:00',
    });
    expect(resolveOrgStandardWorkTimes(defaults)).toEqual({
      start: '07:00',
      end: '15:00',
    });
  });

  it('falls back when only one side is saved or pair is invalid', () => {
    expect(
      resolveOrgStandardWorkTimes(
        parseLaborCostDefaults({ standardWorkStartTime: '07:00' }),
      ),
    ).toEqual({ start: '09:00', end: '17:00' });

    expect(
      resolveOrgStandardWorkTimes(
        parseLaborCostDefaults({
          standardWorkStartTime: '15:00',
          standardWorkEndTime: '07:00',
        }),
      ),
    ).toEqual({ start: '09:00', end: '17:00' });
  });

  it('validates HH:mm pairs for settings save', () => {
    expect(
      parseOrgStandardWorkTimePair({ start: '07:00', end: '15:00' }),
    ).toEqual({
      ok: true,
      standardWorkStartTime: '07:00',
      standardWorkEndTime: '15:00',
    });

    expect(parseOrgStandardWorkTimePair({ start: '', end: '' })).toEqual({
      ok: true,
      standardWorkStartTime: null,
      standardWorkEndTime: null,
    });

    expect(parseOrgStandardWorkTimePair({ start: '09:00', end: '09:00' }).ok).toBe(false);
    expect(parseOrgStandardWorkTimePair({ start: '17:00', end: '09:00' }).ok).toBe(false);
  });

  it('parses stored work times and ignores invalid values', () => {
    expect(
      parseLaborCostDefaults({
        standardWorkStartTime: '07:00',
        standardWorkEndTime: '15:00',
      }),
    ).toMatchObject({
      standardWorkStartTime: '07:00',
      standardWorkEndTime: '15:00',
    });

    expect(
      parseLaborCostDefaults({
        standardWorkStartTime: '25:99',
        standardWorkEndTime: '15:00',
      }),
    ).toMatchObject({
      standardWorkStartTime: null,
      standardWorkEndTime: '15:00',
    });
  });
});
