import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import {
  accumulateRetention,
  resolveCycleLineRetention,
  resolveCycleRetention,
  resolveEffectiveRetentionPercent,
} from '@/modules/billing-plan/domain/retention-math';

const ILS = 'ILS';

describe('billing-plan retention cycle math', () => {
  // E — retention accumulates across cycles; capture uses retention helpers
  it('E: resolves cycle retention from percent and accumulates across cycles', () => {
    const cycle1 = resolveCycleRetention({
      cycleTotal: '100000',
      currency: ILS,
      retentionPercent: '5',
    });
    const cycle2 = resolveCycleRetention({
      cycleTotal: '50000',
      currency: ILS,
      retentionPercent: '5',
    });

    expect(toNumericString(cycle1)).toBe('5000.000000');
    expect(toNumericString(cycle2)).toBe('2500.000000');

    const accumulated = accumulateRetention(ILS, [
      toNumericString(cycle1),
      toNumericString(cycle2),
    ]);
    expect(toNumericString(accumulated)).toBe('7500.000000');
  });

  it('E: effective retention uses cycle → plan → contract (ignores line override)', () => {
    expect(
      resolveEffectiveRetentionPercent({
        lineOverride: '10',
        cyclePercent: '5',
        planDefault: '3',
      }),
    ).toBe('5');
    expect(
      resolveEffectiveRetentionPercent({
        cyclePercent: '5',
        planDefault: '3',
      }),
    ).toBe('5');
    expect(
      resolveEffectiveRetentionPercent({
        cyclePercent: null,
        planDefault: '3',
        contractDefault: '2',
      }),
    ).toBe('3');
    expect(
      resolveEffectiveRetentionPercent({
        cyclePercent: null,
        planDefault: null,
        contractDefault: '2',
      }),
    ).toBe('2');
  });

  it('amount wins over percent for cycle line retention', () => {
    const retention = resolveCycleLineRetention({
      lineAmount: '10000',
      currency: ILS,
      retentionPercent: '10',
      retentionAmount: '250',
    });
    expect(toNumericString(retention)).toBe('250.000000');
  });

  it('rejects retention that exceeds the cycle total', () => {
    expect(() =>
      resolveCycleRetention({
        cycleTotal: '1000',
        currency: ILS,
        retentionAmount: '1500',
      }),
    ).toThrow(DomainRuleError);
  });

  it('zero retention when omitted', () => {
    const retention = resolveCycleRetention({
      cycleTotal: '1000',
      currency: ILS,
    });
    expect(toNumericString(retention)).toBe(toNumericString(money('0', ILS)));
  });
});
