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
      'budgets',
      'boq',
      'changes',
      'billing',
      'billingPlan',
      'expenses',
      'usage',
      'team',
      'time',
      'schedule',
      'work',
      'documents',
      'closeout',
      'warranty',
      'details',
    ]);
    expect(PROJECT_TAB_PRIORITY.indexOf('team')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('schedule'),
    );
    expect(PROJECT_TAB_PRIORITY.indexOf('boq')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('changes'),
    );
    expect(PROJECT_TAB_PRIORITY.indexOf('changes')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('billing'),
    );
    expect(PROJECT_TAB_PRIORITY.indexOf('billing')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('billingPlan'),
    );
  });

  it('filters by visibility without reordering or RTL-reversing', () => {
    const tabs = resolveProjectTabs({
      financials: true,
      expenses: true,
      changes: true,
      boq: true,
      billing: true,
      billingPlan: true,
      budgets: true,
      team: true,
      schedule: true,
      time: true,
      documents: true,
      usage: true,
      work: true,
      closeout: true,
      warranty: true,
    });

    expect(tabs).toEqual([...PROJECT_TAB_PRIORITY]);
    expect(tabs.indexOf('expenses')).toBeLessThan(tabs.indexOf('team'));
    expect(tabs.indexOf('team')).toBeLessThan(tabs.indexOf('schedule'));
    expect(tabs.indexOf('time')).toBeLessThan(tabs.indexOf('schedule'));
    expect(tabs.indexOf('billing')).toBeLessThan(tabs.indexOf('time'));
    expect(tabs.indexOf('billing')).toBeLessThan(tabs.indexOf('billingPlan'));
    expect(tabs.indexOf('documents')).toBeLessThan(tabs.indexOf('details'));
    expect(tabs.indexOf('work')).toBeLessThan(tabs.indexOf('documents'));
  });

  it('keeps overview and details when optional modules are off', () => {
    expect(
      resolveProjectTabs({
        financials: false,
        expenses: false,
        changes: false,
        boq: false,
        billing: false,
        billingPlan: false,
        budgets: false,
        team: false,
        schedule: false,
        time: false,
        documents: false,
        usage: false,
        work: false,
        closeout: false,
        warranty: false,
      }),
    ).toEqual(['overview', 'details']);
  });

  it('relies on locale dir for visual start edge instead of reversing the array', () => {
    expect(localeDirection('he-IL')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
    // Same data order for both locales - Tabs Root `dir` places index 0 at start.
    const tabs = resolveProjectTabs({
      financials: true,
      expenses: true,
      changes: false,
      boq: false,
      billing: false,
      billingPlan: false,
      budgets: false,
      team: false,
      schedule: false,
      time: false,
      documents: false,
      usage: false,
      work: false,
      closeout: false,
      warranty: false,
    });
    expect(tabs[0]).toBe('overview');
    expect(tabs).toEqual(['overview', 'financials', 'expenses', 'details']);
  });
});
