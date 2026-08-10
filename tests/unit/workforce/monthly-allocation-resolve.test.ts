import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  deriveKnownEmployerCost,
  resolveMonthlyAllocationAmounts,
} from '@/modules/workforce/domain/monthly-allocation';
import {
  previewBillAllocationStrip,
  resolveBillAllocationLineAmount,
  resolveBillProjectAllocationLines,
} from '@/modules/ap/domain/bill-project-allocation';

describe('resolveMonthlyAllocationAmounts', () => {
  it('conserves known = allocated + unallocated for fixed amounts', () => {
    const result = resolveMonthlyAllocationAmounts({
      knownAmount: money('10000', 'ILS'),
      method: 'fixed_amount',
      lines: [
        { projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', amount: '6000' },
        { projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', amount: '2500' },
      ],
    });
    expect(result.allocatedAmount.amount).toBe('8500.000000');
    expect(result.unallocatedAmount.amount).toBe('1500.000000');
    expect(result.lines).toHaveLength(2);
  });

  it('rejects fixed amounts that exceed known', () => {
    expect(() =>
      resolveMonthlyAllocationAmounts({
        knownAmount: money('100', 'ILS'),
        method: 'fixed_amount',
        lines: [{ projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', amount: '150' }],
      }),
    ).toThrow(/exceeds known/i);
  });

  it('weights hours across projects with residue on last id-sorted line', () => {
    const result = resolveMonthlyAllocationAmounts({
      knownAmount: money('100', 'ILS'),
      method: 'hours',
      lines: [
        { projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', hours: '1' },
        { projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', hours: '1' },
      ],
    });
    expect(result.unallocatedAmount.amount).toBe('0.000000');
    const sum = result.lines.reduce((acc, line) => acc + Number(line.amount.amount), 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('leaves percent remainder as unallocated', () => {
    const result = resolveMonthlyAllocationAmounts({
      knownAmount: money('1000', 'ILS'),
      method: 'percent',
      lines: [
        { projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', percent: '40' },
        { projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', percent: '25' },
      ],
    });
    expect(result.allocatedAmount.amount).toBe('650.000000');
    expect(result.unallocatedAmount.amount).toBe('350.000000');
  });

  it('deriveKnownEmployerCost prefers actual when present', () => {
    const derived = deriveKnownEmployerCost({
      estimatedAmount: '9000',
      actualAmount: '10000',
      currency: 'ILS',
    });
    expect(derived.knownQuality).toBe('actual');
    expect(derived.knownAmount.amount).toBe('10000.000000');
  });
});

describe('resolveBillProjectAllocationLines / preview', () => {
  it('preview conserves NET = allocated + unallocated', () => {
    const preview = previewBillAllocationStrip({
      recognizedNet: '1000',
      lines: [
        { projectId: 'p1', method: 'manual_amount', amount: '400' },
        { projectId: 'p2', method: 'manual_amount', amount: '350' },
      ],
    });
    expect(preview.allocated).toBe('750.00');
    expect(preview.unallocated).toBe('250.00');
    expect(preview.exceeds).toBe(false);
  });

  it('resolves percent and days against bill NET', () => {
    expect(
      resolveBillAllocationLineAmount(
        { projectId: 'p1', method: 'manual_percent', percent: '25' },
        200,
        0,
        1,
      ),
    ).toBe(50);
    expect(
      resolveBillAllocationLineAmount(
        { projectId: 'p1', method: 'active_days', days: '2' },
        100,
        4,
        2,
      ),
    ).toBe(50);
  });

  it('rejects over-NET persistence resolution', () => {
    expect(() =>
      resolveBillProjectAllocationLines({
        recognizedNet: '100',
        currency: 'ILS',
        lines: [
          { projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', method: 'manual_amount', amount: '60' },
          { projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', method: 'manual_amount', amount: '50' },
        ],
      }),
    ).toThrow(/exceeds bill NET/i);
  });

  it('allows under-NET with visible unallocated', () => {
    const resolved = resolveBillProjectAllocationLines({
      recognizedNet: '100',
      currency: 'ILS',
      lines: [
        { projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', method: 'manual_amount', amount: '40' },
      ],
    });
    expect(resolved.allocatedAmount).toBe('40.000000');
    expect(resolved.unallocatedAmount).toBe('60.000000');
  });
});
