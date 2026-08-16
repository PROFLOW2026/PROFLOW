import { describe, expect, it } from 'vitest';
import {
  JOB_TAB_PRIORITY,
  resolveJobTabs,
} from '@/app/[locale]/(app)/jobs/job-tab-order';
import {
  PROJECT_TAB_PRIORITY,
  resolveProjectTabs,
} from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';

describe('job tab priority', () => {
  it('prioritizes overview, expenses, team, time, billing, documents over setup', () => {
    expect(JOB_TAB_PRIORITY).toEqual([
      'overview',
      'expenses',
      'team',
      'usage',
      'time',
      'billing',
      'budgets',
      'documents',
      'financials',
      'details',
    ]);
    // Planning Gantt stays project-only - never force schedule onto jobs.
    expect(JOB_TAB_PRIORITY).not.toContain('schedule');
  });

  it('hides work, changes, and schedule by default for jobs', () => {
    const tabs = resolveJobTabs({
      expenses: true,
      team: true,
      time: true,
      billing: true,
      documents: true,
      financials: true,
      usage: false,
    });
    expect(tabs).not.toContain('work');
    expect(tabs).not.toContain('changes');
    expect(tabs).not.toContain('schedule');
    expect(tabs.indexOf('expenses')).toBeLessThan(tabs.indexOf('team'));
    expect(tabs.indexOf('team')).toBeLessThan(tabs.indexOf('time'));
    expect(tabs.indexOf('billing')).toBeLessThan(tabs.indexOf('documents'));
  });

  it('does not alter classic project tab order', () => {
    expect(PROJECT_TAB_PRIORITY[0]).toBe('overview');
    expect(PROJECT_TAB_PRIORITY.indexOf('financials')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('expenses'),
    );
    expect(PROJECT_TAB_PRIORITY.indexOf('team')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('schedule'),
    );
    expect(
      resolveProjectTabs({
        financials: true,
        expenses: true,
        changes: true,
        boq: true,
        billing: true,
        budgets: true,
        team: true,
        schedule: true,
        time: true,
        documents: true,
        usage: true,
        work: true,
      }),
    ).toEqual([...PROJECT_TAB_PRIORITY]);
  });
});
