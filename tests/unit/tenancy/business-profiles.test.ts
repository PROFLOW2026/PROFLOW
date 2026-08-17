import { describe, expect, it } from 'vitest';
import {
  BUSINESS_PROFILE_KEYS,
  BUSINESS_PROFILES,
  BUSINESS_PROFILE_SETTING_KEY,
  QUICK_CREATE_EMPHASIS_SETTING_KEY,
  SUGGESTED_DEFAULTS_SETTING_KEY,
  TERMINOLOGY_SETTING_KEY,
  getBusinessProfile,
  getBusinessProfileSetup,
  resolveBusinessProfileKey,
  parseTerminology,
  parseQuickCreateEmphasis,
  parseSuggestedDefaults,
  orderQuickCreateActions,
} from '@/modules/tenancy';

describe('business profiles', () => {
  it('exposes the eighteen configuration presets', () => {
    expect(BUSINESS_PROFILE_KEYS).toHaveLength(18);
    expect(BUSINESS_PROFILES).toHaveLength(18);
    expect(BUSINESS_PROFILES.map((profile) => profile.key)).toEqual([...BUSINESS_PROFILE_KEYS]);
    expect(getBusinessProfile('ELECTRICAL')?.workMix).toBe('mixed');
    expect(getBusinessProfile('FIELD_SERVICE')?.visibleModules).toContain('service');
    expect(getBusinessProfile('SUBCONTRACTOR')?.workMix).toBe('projects');
    expect(getBusinessProfile('DESIGNER')?.workMix).toBe('mixed');
    expect(getBusinessProfile('SAFETY_INSPECTION_CONSULTANT')?.visibleModules).toContain('safety');
  });

  it('never enables the portal door on any profile', () => {
    for (const profile of BUSINESS_PROFILES) {
      expect(profile.visibleModules).not.toContain('portal');
    }
  });

  it('maps legacy profession keys without inventing new products', () => {
    expect(resolveBusinessProfileKey('electrician')).toBe('ELECTRICAL');
    expect(resolveBusinessProfileKey('architect')).toBe('ARCHITECT');
    expect(resolveBusinessProfileKey('main_contractor')).toBe('GENERAL_CONTRACTOR');
    expect(resolveBusinessProfileKey('hvac_subcontractor')).toBe('HVAC');
    expect(resolveBusinessProfileKey('safety_consultant')).toBe('SAFETY_INSPECTION_CONSULTANT');
    expect(resolveBusinessProfileKey('interior_design')).toBe('DESIGNER');
    expect(resolveBusinessProfileKey('none')).toBeNull();
    expect(resolveBusinessProfileKey('HVAC')).toBe('HVAC');
  });

  it('stores profile application in organization settings JSON keys (no schema fork)', () => {
    expect(BUSINESS_PROFILE_SETTING_KEY).toBe('business_profile');
    expect(TERMINOLOGY_SETTING_KEY).toBe('work_terminology');
    expect(QUICK_CREATE_EMPHASIS_SETTING_KEY).toBe('quick_create_emphasis');
    expect(SUGGESTED_DEFAULTS_SETTING_KEY).toBe('business_profile_defaults');
  });

  it('seeds setup suggestions without enabling portal', () => {
    const setup = getBusinessProfileSetup('ELECTRICAL');
    expect(setup.todayEmphasis).toBe('field');
    expect(setup.documentFolders.length).toBeGreaterThan(0);
    expect(setup.formTemplates.length).toBeGreaterThan(0);
    expect(setup.projectTemplateKeys).toContain('electrical_project');
    for (const profile of BUSINESS_PROFILES) {
      expect(profile.visibleModules).not.toContain('portal');
      expect(getBusinessProfileSetup(profile.key).todayEmphasis).toMatch(/^(field|today|dashboard)$/);
    }
  });

  it('parses suggested defaults including optional today emphasis', () => {
    expect(
      parseSuggestedDefaults({
        defaultWorkKind: 'job',
        preferServiceSurface: true,
        todayEmphasis: 'field',
      }),
    ).toEqual({
      defaultWorkKind: 'job',
      preferServiceSurface: true,
      todayEmphasis: 'field',
    });
    expect(
      parseSuggestedDefaults({ defaultWorkKind: 'project', preferServiceSurface: false }),
    ).toEqual({ defaultWorkKind: 'project', preferServiceSurface: false });
  });

  it('hides quotes, CRM, and BOQ on the subcontractor template until needed', () => {
    const modules = getBusinessProfile('SUBCONTRACTOR')!.visibleModules;
    expect(modules).not.toContain('quotes');
    expect(modules).not.toContain('crm');
    expect(modules).not.toContain('boq');
    expect(modules).toContain('vendors');
    expect(modules).toContain('workforce');
    expect(modules).toContain('field_ops');
  });

  it('hides inventory and BOQ on architect and designer templates', () => {
    for (const key of ['ARCHITECT', 'DESIGNER'] as const) {
      const modules = getBusinessProfile(key)!.visibleModules;
      expect(modules).not.toContain('materials');
      expect(modules).not.toContain('boq');
      expect(modules).toContain('documents');
      expect(modules).toContain('quotes');
      expect(modules).toContain('clients');
    }
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
