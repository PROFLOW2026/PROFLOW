import { describe, expect, it } from 'vitest';
import {
  assertSafeItemStateTransition,
  buildItemKey,
  compareCommandCenterItems,
  computeRankScore,
  sortCommandCenterItems,
  SOURCE_DEFAULT_SEVERITY,
  withItemDefaults,
  groupInboxBySeverity,
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
    expect(assertSafeItemStateTransition('forecast_warning', 'handled').ok).toBe(false);
    expect(assertSafeItemStateTransition('forecast_warning', 'snoozed').ok).toBe(true);
    expect(SOURCE_DEFAULT_SEVERITY.forecast_warning).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.vendor_bill_approaching).toBe('high');
  });

  it('ranks new ops sources and blocks dismiss on financial forecast items', () => {
    expect(SOURCE_DEFAULT_SEVERITY.vendor_bill_approaching).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.ocr_needs_review).toBe('medium');
    expect(SOURCE_DEFAULT_SEVERITY.ocr_failed).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.punch_open).toBe('medium');
    expect(SOURCE_DEFAULT_SEVERITY.safety_open).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.inspection_open).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.forecast_warning).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.timesheet_missing).toBe('medium');
    expect(SOURCE_DEFAULT_SEVERITY.recurring_draft_issue).toBe('medium');

    expect(isFinancialSourceType('forecast_warning')).toBe(true);
    expect(isFinancialSourceType('vendor_bill_approaching')).toBe(true);
    expect(isFinancialSourceType('punch_open')).toBe(false);

    const forecast = withItemDefaults({
      sourceType: 'forecast_warning',
      sourceId: 'projected_cost_over_budget:p1',
      what: 'Review',
      why: 'Projected',
      where: 'Project A',
      href: '/projects/p1?tab=financials',
      severity: 'critical',
    });
    expect(forecast.allowHandle).toBe(false);
    expect(forecast.isFinancial).toBe(true);
    expect(assertSafeItemStateTransition('forecast_warning', 'dismissed').ok).toBe(false);
    expect(assertSafeItemStateTransition('forecast_warning', 'handled').ok).toBe(false);
    expect(assertSafeItemStateTransition('forecast_warning', 'snoozed').ok).toBe(true);
    expect(assertSafeItemStateTransition('vendor_bill_approaching', 'dismissed').ok).toBe(false);
  });

  it('ranks next-gen sources and keeps cash-flow risk financial', () => {
    expect(SOURCE_DEFAULT_SEVERITY.closeout_blockers).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.warranty_expiring).toBe('medium');
    expect(SOURCE_DEFAULT_SEVERITY.cash_flow_risk).toBe('critical');
    expect(SOURCE_DEFAULT_SEVERITY.automation_followup).toBe('medium');
    expect(SOURCE_DEFAULT_SEVERITY.communication_failed).toBe('high');

    expect(isFinancialSourceType('cash_flow_risk')).toBe(true);
    expect(isFinancialSourceType('closeout_blockers')).toBe(false);
    expect(isFinancialSourceType('warranty_expiring')).toBe(false);
    expect(isFinancialSourceType('automation_followup')).toBe(false);
    expect(isFinancialSourceType('communication_failed')).toBe(false);

    const cash = withItemDefaults({
      sourceType: 'cash_flow_risk',
      sourceId: 'org-1',
      what: 'Review',
      why: 'Overdue',
      where: 'Cash flow',
      href: '/cash-flow',
    });
    expect(cash.allowHandle).toBe(false);
    expect(cash.isFinancial).toBe(true);
    expect(assertSafeItemStateTransition('cash_flow_risk', 'dismissed').ok).toBe(false);
    expect(assertSafeItemStateTransition('cash_flow_risk', 'handled').ok).toBe(false);
    expect(assertSafeItemStateTransition('closeout_blockers', 'handled').ok).toBe(true);

    const closeout = withItemDefaults({
      sourceType: 'closeout_blockers',
      sourceId: 'c1',
      what: 'Finish',
      why: 'Blocked',
      where: 'Project A',
      href: '/projects/p1?tab=closeout',
    });
    const sorted = sortCommandCenterItems([closeout, cash]);
    expect(sorted[0]?.sourceType).toBe('cash_flow_risk');
  });

  it('groups inbox items by severity and hides empty sections', () => {
    const critical = withItemDefaults({
      sourceType: 'overdue_ar',
      sourceId: 'a',
      what: 'Collect',
      why: 'Past due',
      where: 'A',
      href: '/billing/a',
    });
    const info = withItemDefaults({
      sourceType: 'stale_project',
      sourceId: 'b',
      what: 'Check',
      why: 'Quiet',
      where: 'B',
      href: '/projects/b',
    });
    const sections = groupInboxBySeverity([info, critical]);
    expect(sections.map((section) => section.severity)).toEqual(['critical', 'low']);
    expect(sections[0]?.items[0]?.itemKey).toBe(critical.itemKey);
  });
});
