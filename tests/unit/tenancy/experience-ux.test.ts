import { describe, expect, it } from 'vitest';
import {
  applyComplexityToVisibility,
  CANONICAL_QUICK_CREATE_KEYS,
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
  it('returns the canonical order regardless of persona', () => {
    const actions = [
      { key: 'change' },
      { key: 'expense' },
      { key: 'quickCapture' },
      { key: 'project' },
      { key: 'payment' },
      { key: 'vendorBill' },
    ];
    const contractor = limitQuickCreateForPersona(actions, 'project_contractor');
    const all = limitQuickCreateForPersona(actions, 'all');
    expect(contractor.map((a) => a.key)).toEqual(['quickCapture', 'project', 'expense', 'change']);
    expect(all.map((a) => a.key)).toEqual(contractor.map((a) => a.key));
  });

  it('never surfaces non-canonical keys', () => {
    const actions = [
      { key: 'payment' },
      { key: 'asset' },
      { key: 'vendorBill' },
      { key: 'attendance' },
      { key: 'recurringDrafts' },
      { key: 'quickCapture' },
      { key: 'project' },
    ];
    const limited = limitQuickCreateForPersona(actions, 'electrical');
    expect(limited.map((a) => a.key)).toEqual(['quickCapture', 'project']);
    for (const key of limited.map((a) => a.key)) {
      expect(CANONICAL_QUICK_CREATE_KEYS).toContain(key);
    }
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
    expect(PERSONA_PRIMARY_NAV_KEYS.consulting).toContain('portfolio');
    expect(PERSONA_PRIMARY_NAV_KEYS.consulting).toContain('myWork');
    expect(PERSONA_PRIMARY_NAV_KEYS.architecture).toContain('portfolio');
    expect(PERSONA_PRIMARY_NAV_KEYS.inspection).toContain('fieldOps');
  });
});
