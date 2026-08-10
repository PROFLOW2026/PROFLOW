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
  it('prioritizes overview, expenses, time, billing, documents over setup', () => {
    expect(JOB_TAB_PRIORITY).toEqual([
      'overview',
      'expenses',
      'time',
      'billing',
      'documents',
      'financials',
      'details',
    ]);
  });

  it('hides work and changes by default for jobs', () => {
    const tabs = resolveJobTabs({
      expenses: true,
      time: true,
      billing: true,
      documents: true,
      financials: true,
    });
    expect(tabs).not.toContain('work');
    expect(tabs).not.toContain('changes');
    expect(tabs.indexOf('expenses')).toBeLessThan(tabs.indexOf('time'));
    expect(tabs.indexOf('billing')).toBeLessThan(tabs.indexOf('documents'));
  });

  it('does not alter classic project tab order', () => {
    expect(PROJECT_TAB_PRIORITY[0]).toBe('overview');
    expect(PROJECT_TAB_PRIORITY.indexOf('financials')).toBeLessThan(
      PROJECT_TAB_PRIORITY.indexOf('expenses'),
    );
    expect(
      resolveProjectTabs({
        financials: true,
        expenses: true,
        changes: true,
        billing: true,
        time: true,
        documents: true,
        work: true,
      }),
    ).toEqual([...PROJECT_TAB_PRIORITY]);
  });
});
