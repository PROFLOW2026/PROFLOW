import { describe, expect, it } from 'vitest';
import {
  assertSafeItemStateTransition,
  buildItemKey,
  compareCommandCenterItems,
  computeRankScore,
  sortCommandCenterItems,
  SOURCE_DEFAULT_SEVERITY,
  withItemDefaults,
} from '@/modules/command-center/domain/ranking';
import { isFinancialSourceType } from '@/modules/command-center/domain/types';

describe('command center ranking', () => {
  it('builds stable item keys', () => {
    expect(buildItemKey('overdue_ar', 'bill-1')).toBe('overdue_ar:bill-1');
  });

  it('ranks critical above high/medium/low', () => {
    expect(computeRankScore('critical')).toBeGreaterThan(computeRankScore('high'));
    expect(computeRankScore('high')).toBeGreaterThan(computeRankScore('medium'));
    expect(computeRankScore('medium')).toBeGreaterThan(computeRankScore('low'));
  });

  it('applies urgency bump within severity band', () => {
    expect(computeRankScore('critical', 40)).toBeGreaterThan(computeRankScore('critical', 5));
    expect(computeRankScore('critical', 5)).toBeGreaterThan(computeRankScore('high', 99));
  });

  it('sorts critical overdue AR ahead of stale projects', () => {
    const overdue = withItemDefaults({
      sourceType: 'overdue_ar',
      sourceId: 'a',
      what: 'Collect',
      why: 'Past due',
      where: 'Project A',
      href: '/billing/a',
      urgencyBump: 20,
    });
    const stale = withItemDefaults({
      sourceType: 'stale_project',
      sourceId: 'b',
      what: 'Check',
      why: 'Quiet',
      where: 'Project B',
      href: '/projects/b',
    });
    const sorted = sortCommandCenterItems([stale, overdue]);
    expect(sorted[0]?.itemKey).toBe(overdue.itemKey);
    expect(compareCommandCenterItems(overdue, stale)).toBeLessThan(0);
  });

  it('marks financial sources and blocks handle/dismiss', () => {
    expect(isFinancialSourceType('overdue_ar')).toBe(true);
    expect(isFinancialSourceType('attendance_open')).toBe(false);

    const financial = withItemDefaults({
      sourceType: 'vendor_bill_due',
      sourceId: 'v1',
      what: 'Pay',
      why: 'Due',
      where: 'Vendor',
      href: '/procurement/ap/v1',
    });
    expect(financial.allowHandle).toBe(false);
    expect(financial.allowSnooze).toBe(true);
    expect(financial.isFinancial).toBe(true);

    expect(assertSafeItemStateTransition('overdue_ar', 'handled').ok).toBe(false);
    expect(assertSafeItemStateTransition('overdue_ar', 'dismissed').ok).toBe(false);
    expect(assertSafeItemStateTransition('overdue_ar', 'snoozed').ok).toBe(true);
    expect(assertSafeItemStateTransition('attendance_open', 'handled').ok).toBe(true);
  });

  it('uses expected default severities for money vs ops', () => {
    expect(SOURCE_DEFAULT_SEVERITY.overdue_ar).toBe('critical');
    expect(SOURCE_DEFAULT_SEVERITY.vendor_bill_due).toBe('critical');
    expect(SOURCE_DEFAULT_SEVERITY.stale_project).toBe('low');
    expect(SOURCE_DEFAULT_SEVERITY.open_approval).toBe('high');
  });
});
