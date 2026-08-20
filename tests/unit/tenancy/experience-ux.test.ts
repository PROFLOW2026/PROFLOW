import { describe, expect, it } from 'vitest';
import {
  applyComplexityToVisibility,
  filterModulesByComplexity,
  limitQuickCreateForPersona,
  PERSONA_PRIMARY_NAV_KEYS,
  personaForBusinessProfile,
  resolveExperienceRoleSurface,
  todayItemVisibleForPersona,
  todayUrgencyBumpForPersona,
} from '@/modules/tenancy';
import type { OptionalModuleKey } from '@/modules/tenancy/domain/types';

describe('experience persona mapping', () => {
  it('maps business profiles onto UX personas', () => {
    expect(personaForBusinessProfile('GENERAL_CONTRACTOR')).toBe('project_contractor');
    expect(personaForBusinessProfile('ELECTRICAL')).toBe('electrical');
    expect(personaForBusinessProfile('FIELD_SERVICE')).toBe('service');
    expect(personaForBusinessProfile('ARCHITECT')).toBe('architecture');
    expect(personaForBusinessProfile('ENGINEERING_CONSULTANT')).toBe('consulting');
    expect(personaForBusinessProfile('SAFETY_INSPECTION_CONSULTANT')).toBe('inspection');
    expect(personaForBusinessProfile('ALL_CAPABILITIES')).toBe('all');
    expect(personaForBusinessProfile(null)).toBe('mixed');
    expect(personaForBusinessProfile('UNKNOWN')).toBe('mixed');
  });

  it('resolves role surfaces from RBAC keys without replacing permissions', () => {
    expect(resolveExperienceRoleSurface(['owner'])).toBe('owner');
    expect(resolveExperienceRoleSurface(['finance'])).toBe('finance');
    expect(resolveExperienceRoleSurface(['field_worker'])).toBe('field');
    expect(resolveExperienceRoleSurface(['project_manager'])).toBe('project_manager');
    expect(resolveExperienceRoleSurface(['viewer'])).toBe('general');
  });
});

describe('experience complexity filter', () => {
  const recommended: readonly OptionalModuleKey[] = [
    'clients',
    'quotes',
    'billing',
    'documents',
    'workforce',
    'jobs',
    'command_center',
    'vendors',
    'procurement',
    'boq',
    'field_ops',
  ];

  it('keeps full recommendations unchanged', () => {
    expect(filterModulesByComplexity(recommended, 'full', 'project_contractor')).toEqual(
      recommended,
    );
  });

  it('narrows to simple core for contractors', () => {
    const simple = filterModulesByComplexity(recommended, 'simple', 'project_contractor');
    expect(simple).toContain('clients');
    expect(simple).toContain('billing');
    expect(simple).toContain('field_ops');
    expect(simple).not.toContain('vendors');
    expect(simple).not.toContain('boq');
  });

  it('ignores complexity for all persona', () => {
    expect(filterModulesByComplexity(recommended, 'simple', 'all')).toEqual(recommended);
  });

  it('applyComplexityToVisibility only constrains profile mode', () => {
    const modules = Object.fromEntries(recommended.map((key) => [key, true]));
    const profileNext = applyComplexityToVisibility(
      modules,
      recommended,
      'simple',
      'project_contractor',
      'profile',
    );
    expect(profileNext.vendors).toBe(false);
    expect(profileNext.clients).toBe(true);
    expect(profileNext.command_center).toBe(true);

    const customNext = applyComplexityToVisibility(
      modules,
      recommended,
      'simple',
      'project_contractor',
      'custom',
    );
    expect(customNext.vendors).toBe(true);
  });
});

describe('quick create persona limits', () => {
  it('keeps allowlisted actions and caps length', () => {
    const actions = [
      { key: 'project' },
      { key: 'quote' },
      { key: 'expense' },
      { key: 'vendorBill' },
      { key: 'fieldLog' },
      { key: 'change' },
      { key: 'employee' },
      { key: 'vendor' },
    ];
    const limited = limitQuickCreateForPersona(actions, 'project_contractor');
    expect(limited.map((a) => a.key)).toEqual([
      'project',
      'quote',
      'expense',
      'vendorBill',
      'fieldLog',
      'change',
    ]);
    expect(limited).toHaveLength(6);
    expect(limited.find((a) => a.key === 'employee')).toBeUndefined();
  });

  it('allows a longer menu for all persona', () => {
    const actions = [
      { key: 'project' },
      { key: 'job' },
      { key: 'service' },
      { key: 'quote' },
      { key: 'client' },
      { key: 'expense' },
      { key: 'vendor' },
      { key: 'billingRecord' },
      { key: 'employee' },
      { key: 'timeEntry' },
      { key: 'fieldLog' },
      { key: 'change' },
      { key: 'payment' },
    ];
    const limited = limitQuickCreateForPersona(actions, 'all');
    expect(limited.length).toBeGreaterThan(6);
    expect(limited.length).toBeLessThanOrEqual(12);
  });
});

describe('today persona visibility', () => {
  it('keeps critical and money items', () => {
    expect(todayItemVisibleForPersona('punch_open', 'architecture', 'critical')).toBe(true);
    expect(todayItemVisibleForPersona('overdue_ar', 'architecture', 'low')).toBe(true);
  });

  it('hides soft-deemphasized medium/low items', () => {
    expect(todayItemVisibleForPersona('overdue_maintenance', 'architecture', 'medium')).toBe(
      false,
    );
    expect(todayItemVisibleForPersona('boq_vs_contract_mismatch', 'service', 'low')).toBe(false);
  });

  it('boosts focused categories', () => {
    expect(todayUrgencyBumpForPersona('overdue_maintenance', 'service', 'medium')).toBe(35);
    expect(todayUrgencyBumpForPersona('punch_open', 'architecture', 'low')).toBe(0);
  });
});

describe('nav layout primary keys by persona', () => {
  it('differs across personas', () => {
    expect(PERSONA_PRIMARY_NAV_KEYS.service).not.toEqual(
      PERSONA_PRIMARY_NAV_KEYS.project_contractor,
    );
    expect(PERSONA_PRIMARY_NAV_KEYS.service).toContain('workOrders');
    expect(PERSONA_PRIMARY_NAV_KEYS.project_contractor).toContain('projects');
    expect(PERSONA_PRIMARY_NAV_KEYS.consulting).toContain('time');
    expect(PERSONA_PRIMARY_NAV_KEYS.inspection).toContain('fieldOps');
  });
});
