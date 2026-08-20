import { describe, expect, it } from 'vitest';
import {
  assertCapabilityRegistryComplete,
  CAPABILITY_REGISTRY,
  requiredFoundationsFor,
} from '@/modules/tenancy/domain/capability-registry';
import {
  modulePreferenceWritesForProfile,
} from '@/modules/tenancy/domain/capability-overrides';
import {
  canUseExperiencePreview,
  parseExperiencePreviewSelection,
  resolveExperiencePreview,
} from '@/modules/tenancy/domain/experience-preview';
import {
  projectProfileAllowsTab,
  resolveProjectExperienceProfile,
} from '@/modules/tenancy/domain/project-profiles';
import { OPTIONAL_MODULE_KEYS, CUSTOMER_FEATURE_MODULE_KEYS } from '@/modules/tenancy/domain/types';
import { BUSINESS_PROFILE_KEYS, getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import { capabilityForPath } from '@/modules/tenancy/domain/route-capability';
import { todayEmphasisUrgencyBump } from '@/modules/tenancy/domain/experience-presentation';

describe('capability registry', () => {
  it('covers every optional module', () => {
    expect(() => assertCapabilityRegistryComplete()).not.toThrow();
    for (const key of OPTIONAL_MODULE_KEYS) {
      expect(CAPABILITY_REGISTRY[key].id).toBe(key);
    }
  });

  it('keeps portal non-customer-toggleable', () => {
    expect(CAPABILITY_REGISTRY.portal.customerToggle).toBe(false);
    expect(CUSTOMER_FEATURE_MODULE_KEYS).not.toContain('portal');
  });

  it('resolves real foundations only', () => {
    expect(requiredFoundationsFor('procurement')).toEqual(['vendors']);
    expect(requiredFoundationsFor('quotes')).toEqual(['clients']);
    expect(requiredFoundationsFor('billing')).toEqual([]);
  });
});

describe('business profile presets', () => {
  it('includes SMALL_WORKS and ALL_CAPABILITIES', () => {
    expect(BUSINESS_PROFILE_KEYS).toContain('SMALL_WORKS');
    expect(BUSINESS_PROFILE_KEYS).toContain('ALL_CAPABILITIES');
    expect(getBusinessProfile('SMALL_WORKS')?.visibleModules).not.toContain('boq');
    expect(getBusinessProfile('ALL_CAPABILITIES')?.visibleModules).toContain('boq');
    expect(getBusinessProfile('ALL_CAPABILITIES')?.visibleModules).not.toContain('portal');
  });

  it('replace mode turns off non-recommended customer modules', () => {
    const writes = modulePreferenceWritesForProfile('SMALL_WORKS', 'replace');
    const byKey = Object.fromEntries(writes.map((w) => [w.moduleKey, w.enabled]));
    expect(byKey.clients).toBe(true);
    expect(byKey.jobs).toBe(true);
    expect(byKey.boq).toBe(false);
    expect(byKey.procurement).toBe(false);
  });

  it('additive mode only enables recommended modules', () => {
    const writes = modulePreferenceWritesForProfile('ELECTRICAL', 'additive');
    expect(writes.every((w) => w.enabled)).toBe(true);
    expect(writes.map((w) => w.moduleKey)).toContain('jobs');
    expect(writes.map((w) => w.moduleKey)).not.toContain('boq');
  });
});

describe('experience preview', () => {
  it('parses selection and stays preview-only', () => {
    expect(parseExperiencePreviewSelection('ELECTRICAL')).toBe('ELECTRICAL');
    expect(parseExperiencePreviewSelection('actual')).toBe('actual');
    expect(parseExperiencePreviewSelection('nope')).toBe('actual');
    const resolved = resolveExperiencePreview('ELECTRICAL');
    expect(resolved.active).toBe(true);
    expect(resolved.modules?.jobs).toBe(true);
    expect(resolved.modules?.portal).toBe(false);
    expect(resolveExperiencePreview('actual').active).toBe(false);
  });

  it('gates to owner + non-production by default', () => {
    expect(canUseExperiencePreview(['owner'], 'local', undefined)).toBe(true);
    expect(canUseExperiencePreview(['admin'], 'local', undefined)).toBe(false);
    expect(canUseExperiencePreview(['owner'], 'production', undefined)).toBe(false);
    expect(canUseExperiencePreview(['owner'], 'production', '1')).toBe(true);
  });
});

describe('project experience profiles', () => {
  it('derives defaults from work kind and org profile', () => {
    expect(
      resolveProjectExperienceProfile({ stored: null, workKind: 'job' }),
    ).toBe('small_job');
    expect(
      resolveProjectExperienceProfile({ stored: null, workKind: 'work_order' }),
    ).toBe('service_installation');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'ARCHITECT',
      }),
    ).toBe('consulting');
    expect(
      resolveProjectExperienceProfile({
        stored: 'boq',
        workKind: 'job',
      }),
    ).toBe('boq');
  });

  it('limits simple tabs without removing financial truth', () => {
    expect(projectProfileAllowsTab('simple', 'expenses')).toBe(true);
    expect(projectProfileAllowsTab('simple', 'boq')).toBe(false);
    expect(projectProfileAllowsTab('consulting', 'boq')).toBe(false);
    expect(projectProfileAllowsTab('full', 'boq')).toBe(true);
  });
});

describe('route capability + today bias', () => {
  it('maps deep links to optional modules', () => {
    expect(capabilityForPath('/he-IL/procurement/materials/x')).toBe('materials');
    expect(capabilityForPath('/quotes/abc')).toBe('quotes');
    expect(capabilityForPath('/projects')).toBeNull();
  });

  it('boosts profile-relevant today sources softly', () => {
    expect(todayEmphasisUrgencyBump('punch_open', 'field')).toBeGreaterThan(0);
    expect(todayEmphasisUrgencyBump('overdue_ar', 'dashboard')).toBeGreaterThan(0);
    expect(todayEmphasisUrgencyBump('stale_project', 'field')).toBe(0);
  });
});
