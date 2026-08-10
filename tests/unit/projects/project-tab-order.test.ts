import { describe, expect, it } from 'vitest';
import {
  PROJECT_TAB_PRIORITY,
  resolveProjectTabs,
} from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';
import { localeDirection } from '@/shared/i18n/config';

describe('project tab business priority', () => {
  it('places schedule after team among daily ops, before time/docs/setup', () => {
    expect(PROJECT_TAB_PRIORITY).toEqual([
      'overview',
      'financials',
      'expenses',
      'team',
      'schedule',
      'changes',
      'billing',
      'time',
      'documents',
      'work',
      'details',
    ]);
    expect(PROJECT_TAB_PRIORITY.indexOf('team')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('schedule'),
    );
  });

  it('filters by visibility without reordering or RTL-reversing', () => {
    const tabs = resolveProjectTabs({
      financials: true,
      expenses: true,
      changes: true,
      billing: true,
      team: true,
      schedule: true,
      time: true,
      documents: true,
      work: true,
    });

    expect(tabs).toEqual([...PROJECT_TAB_PRIORITY]);
    expect(tabs.indexOf('expenses')).toBeLessThan(tabs.indexOf('team'));
    expect(tabs.indexOf('team')).toBeLessThan(tabs.indexOf('schedule'));
    expect(tabs.indexOf('schedule')).toBeLessThan(tabs.indexOf('time'));
    expect(tabs.indexOf('billing')).toBeLessThan(tabs.indexOf('time'));
    expect(tabs.indexOf('documents')).toBeLessThan(tabs.indexOf('work'));
    expect(tabs.indexOf('work')).toBeLessThan(tabs.indexOf('details'));
  });

  it('keeps overview and details when optional modules are off', () => {
    expect(
      resolveProjectTabs({
        financials: false,
        expenses: false,
        changes: false,
        billing: false,
        team: false,
        schedule: false,
        time: false,
        documents: false,
        work: false,
      }),
    ).toEqual(['overview', 'details']);
  });

  it('relies on locale dir for visual start edge instead of reversing the array', () => {
    expect(localeDirection('he-IL')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
    // Same data order for both locales — Tabs Root `dir` places index 0 at start.
    const tabs = resolveProjectTabs({
      financials: true,
      expenses: true,
      changes: false,
      billing: false,
      team: false,
      schedule: false,
      time: false,
      documents: false,
      work: false,
    });
    expect(tabs[0]).toBe('overview');
    expect(tabs).toEqual(['overview', 'financials', 'expenses', 'details']);
  });
});
