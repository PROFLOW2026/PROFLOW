import { describe, expect, it } from 'vitest';
import {
  PROJECT_HUB_PRIORITY,
  hubNavigationHref,
  resolveHubFromTabParam,
  resolveProjectHubs,
} from '@/app/[locale]/(app)/projects/[projectId]/project-hub-order';
import { distributeUnitsAcrossFloors } from '@/modules/project-profile/domain/structure-wizard';

describe('project hub order', () => {
  it('exposes five owner hubs without overview', () => {
    expect(PROJECT_HUB_PRIORITY).toEqual(['money', 'work', 'documents', 'infra', 'details']);
  });

  it('maps legacy overview tab to money / financials', () => {
    expect(resolveHubFromTabParam('overview')).toEqual({
      hub: 'money',
      section: 'financials',
    });
    expect(resolveHubFromTabParam(undefined)).toEqual({
      hub: 'money',
      section: 'financials',
    });
  });

  it('maps infra to its own hub', () => {
    expect(resolveHubFromTabParam('infra')).toEqual({ hub: 'infra', section: 'infra' });
  });

  it('uses bare project URL for money hub navigation', () => {
    expect(hubNavigationHref('/projects/p1', 'money')).toBe('/projects/p1');
    expect(hubNavigationHref('/projects/p1', 'infra')).toBe('/projects/p1?tab=infra');
  });

  it('includes infra hub when infra visibility is on', () => {
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
      documents: true,
      infra: true,
      usage: false,
      work: false,
      closeout: true,
      warranty: true,
    });
    expect(hubs).toContain('infra');
    expect(hubs[0]).toBe('money');
  });
});

describe('distributeUnitsAcrossFloors', () => {
  it('handles uneven totals', () => {
    expect(distributeUnitsAcrossFloors(3, 10)).toEqual([4, 3, 3]);
  });
  it('splits 30 units across 8 floors with minimal imbalance', () => {
    expect(distributeUnitsAcrossFloors(8, 30)).toEqual([4, 4, 4, 4, 4, 4, 3, 3]);
  });

  it('returns zeros when total is zero', () => {
    expect(distributeUnitsAcrossFloors(5, 0)).toEqual([0, 0, 0, 0, 0]);
  });
});
