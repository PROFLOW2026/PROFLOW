import { describe, expect, it } from 'vitest';
import { resolveProjectHubs } from '@/app/[locale]/(app)/projects/[projectId]/project-hub-order';
import { resolveProjectFilesTabVisible } from '@/app/[locale]/(app)/projects/[projectId]/project-tab-order';

describe('resolveProjectFilesTabVisible', () => {
  it('shows files tab when user can read documents', () => {
    expect(resolveProjectFilesTabVisible(true)).toBe(true);
  });

  it('hides files tab without documents read permission', () => {
    expect(resolveProjectFilesTabVisible(false)).toBe(false);
  });
});

describe('resolveProjectHubs documents hub', () => {
  it('includes documents hub when files tab is visible even if optional module is off', () => {
    const hubs = resolveProjectHubs({
      financials: true,
      expenses: false,
      changes: false,
      boq: false,
      billing: false,
      billingPlan: false,
      budgets: false,
      team: false,
      schedule: false,
      time: false,
      documents: resolveProjectFilesTabVisible(true),
      usage: false,
      work: true,
      closeout: true,
      warranty: true,
    });
    expect(hubs).toContain('documents');
    expect(hubs.indexOf('work')).toBeLessThan(hubs.indexOf('documents'));
    expect(hubs.indexOf('documents')).toBeLessThan(hubs.indexOf('details'));
  });
});
