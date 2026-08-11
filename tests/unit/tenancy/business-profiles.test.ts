import { describe, expect, it } from 'vitest';
import {
  BUSINESS_PROFILE_KEYS,
  BUSINESS_PROFILES,
  getBusinessProfile,
  resolveBusinessProfileKey,
  parseTerminology,
  parseQuickCreateEmphasis,
  orderQuickCreateActions,
} from '@/modules/tenancy';

describe('business profiles', () => {
  it('exposes the twelve configuration presets', () => {
    expect(BUSINESS_PROFILE_KEYS).toHaveLength(12);
    expect(BUSINESS_PROFILES).toHaveLength(12);
    expect(getBusinessProfile('ELECTRICAL')?.workMix).toBe('mixed');
    expect(getBusinessProfile('FIELD_SERVICE')?.visibleModules).toContain('service');
  });

  it('maps legacy profession keys without inventing new products', () => {
    expect(resolveBusinessProfileKey('electrician')).toBe('ELECTRICAL');
    expect(resolveBusinessProfileKey('main_contractor')).toBe('GENERAL_CONTRACTOR');
    expect(resolveBusinessProfileKey('none')).toBeNull();
    expect(resolveBusinessProfileKey('HVAC')).toBe('HVAC');
  });

  it('parses terminology and quick-create emphasis settings', () => {
    const profile = getBusinessProfile('CLEANING')!;
    expect(parseTerminology(profile.terminology)?.job.he).toBe('עבודת ניקיון');
    expect(parseQuickCreateEmphasis(profile.quickCreateEmphasis)?.[0]).toBe('service');
  });

  it('orders quick create by profile emphasis', () => {
    const actions = [{ key: 'expense' }, { key: 'project' }, { key: 'job' }];
    expect(orderQuickCreateActions(actions, ['job', 'expense']).map((a) => a.key)).toEqual([
      'job',
      'expense',
      'project',
    ]);
    expect(orderQuickCreateActions(actions, null).map((a) => a.key)).toEqual([
      'expense',
      'project',
      'job',
    ]);
  });

  it('never claims industry-specific financial forks', () => {
    for (const profile of BUSINESS_PROFILES) {
      expect(profile.suggestedDefaults.defaultWorkKind).toMatch(/^(project|job|work_order)$/);
      expect(profile.costCategories.every((c) => c.family)).toBe(true);
    }
  });
});
