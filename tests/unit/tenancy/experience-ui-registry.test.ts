import { describe, expect, it } from 'vitest';
import {
  buildExperienceUiContext,
  filterDashboardCards,
  isExperienceUiVisible,
  navDemoteKeysFromOverrides,
} from '@/modules/tenancy/domain/experience-ui-registry';
import { applyExperienceUiToProjectTabVisibility } from '@/modules/tenancy/domain/experience-ui-project-tabs';

describe('experience-ui-registry', () => {
  const customCtx = buildExperienceUiContext({
    customizationMode: 'custom',
    family: 'project_contracting',
    overrides: { 'card.profit': false, 'nav.expenses': false },
  });

  it('hides dashboard cards when override false', () => {
    const cards = filterDashboardCards(['profit', 'billing'], customCtx);
    expect(cards).toEqual(['billing']);
  });

  it('demotes nav keys without removing from catalog', () => {
    const demote = navDemoteKeysFromOverrides(customCtx);
    expect(demote.has('expenses')).toBe(true);
  });

  it('keeps project tab when data present', () => {
    const base = {
      financials: true,
      expenses: true,
      changes: false,
      boq: true,
      billing: true,
      billingPlan: true,
      budgets: false,
      team: false,
      schedule: false,
      time: false,
      documents: true,
      usage: false,
      work: false,
      closeout: true,
      warranty: true,
    };
    const ctx = buildExperienceUiContext({
      customizationMode: 'custom',
      family: 'custom',
      overrides: { 'projectTab.boq': false },
    });
    const next = applyExperienceUiToProjectTabVisibility(base, ctx, { boq: true });
    expect(next.boq).toBe(true);
  });

  it('allows hide when empty confirmed', () => {
    const base = {
      financials: true,
      expenses: true,
      changes: false,
      boq: true,
      billing: true,
      billingPlan: true,
      budgets: false,
      team: false,
      schedule: false,
      time: false,
      documents: true,
      usage: false,
      work: false,
      closeout: true,
      warranty: true,
    };
    const ctx = buildExperienceUiContext({
      customizationMode: 'custom',
      family: 'custom',
      overrides: { 'projectTab.boq': false },
    });
    const next = applyExperienceUiToProjectTabVisibility(base, ctx, { boq: false });
    expect(next.boq).toBe(false);
  });

  it('ignores overrides when not in custom mode', () => {
    const ctx = buildExperienceUiContext({
      customizationMode: 'profile',
      family: 'custom',
      overrides: { 'card.profit': false },
    });
    expect(isExperienceUiVisible('card.profit', ctx)).toBe(true);
  });
});
