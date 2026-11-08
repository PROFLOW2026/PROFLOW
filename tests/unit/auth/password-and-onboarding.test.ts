import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  isPasswordLongEnough,
  passwordsMatch,
} from '@/shared/auth/password-policy';
import { filterModulesByComplexity } from '@/modules/tenancy/domain/experience-complexity';
import { personaForBusinessProfile } from '@/modules/tenancy/domain/experience-persona';
import {
  DEFAULT_ONBOARDING_COMPLEXITY,
  modulesForManageOptions,
  resolveOnboardingComplexity,
  resolveOnboardingProfileKey,
  workMixForOnboardingStyle,
} from '@/modules/tenancy/domain/onboarding-experience';
import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';

describe('password policy', () => {
  it('uses a product minimum of 8 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(isPasswordLongEnough('1234567')).toBe(false);
    expect(isPasswordLongEnough('')).toBe(false);
  });

  it('accepts passwords of 8 or more characters', () => {
    expect(isPasswordLongEnough('12345678')).toBe(true);
    expect(isPasswordLongEnough('longer-than-eight')).toBe(true);
  });

  it('requires exact password confirmation match', () => {
    expect(passwordsMatch('abcdefgh', 'abcdefgh')).toBe(true);
    expect(passwordsMatch('abcdefgh', 'abcdefgH')).toBe(false);
    expect(passwordsMatch('abcdefgh', '')).toBe(false);
  });
});

describe('first-run onboarding experience mapping', () => {
  it('maps recommended business type onto the canonical profile', () => {
    expect(
      resolveOnboardingProfileKey({ path: 'recommended', businessType: 'ELECTRICAL' }),
    ).toBe('ELECTRICAL');
  });

  it('maps all capabilities onto ALL_CAPABILITIES without portal', () => {
    expect(
      resolveOnboardingProfileKey({ path: 'all', businessType: 'ELECTRICAL' }),
    ).toBe('ALL_CAPABILITIES');
    const profile = getBusinessProfile('ALL_CAPABILITIES');
    expect(profile).toBeTruthy();
    expect(profile?.visibleModules).not.toContain('portal');
    expect(profile?.visibleModules.length ?? 0).toBeGreaterThan(10);
  });

  it('maps work styles onto stored work mix chrome', () => {
    expect(workMixForOnboardingStyle('projects')).toBe('projects');
    expect(workMixForOnboardingStyle('jobs')).toBe('jobs');
    expect(workMixForOnboardingStyle('service')).toBe('jobs');
    expect(workMixForOnboardingStyle('consulting')).toBe('projects');
    expect(workMixForOnboardingStyle('mixed')).toBe('mixed');
  });

  it('turns manage options into additive customer modules', () => {
    const modules = modulesForManageOptions(['employees', 'boq', 'field']);
    expect(modules).toEqual(expect.arrayContaining(['workforce', 'boq', 'field_ops']));
    expect(modules).not.toContain('portal');
  });

  it('defaults complexity to simple and keeps consulting tasks visible', () => {
    expect(DEFAULT_ONBOARDING_COMPLEXITY).toBe('simple');
    expect(resolveOnboardingComplexity({ profileKey: 'GENERAL_CONTRACTOR' })).toBe('simple');
    expect(resolveOnboardingComplexity({ profileKey: null })).toBe('simple');
    expect(
      resolveOnboardingComplexity({ profileKey: 'ELECTRICAL', selected: 'advanced' }),
    ).toBe('advanced');
    expect(
      resolveOnboardingComplexity({ profileKey: 'ALL_CAPABILITIES', selected: 'simple' }),
    ).toBe('full');

    const consulting = resolveOnboardingComplexity({
      profileKey: 'ENGINEERING_CONSULTANT',
      selected: 'simple',
    });
    const recommended = getBusinessProfile('ENGINEERING_CONSULTANT')?.visibleModules ?? [];
    const persona = personaForBusinessProfile('ENGINEERING_CONSULTANT');
    expect(filterModulesByComplexity(recommended, consulting, persona)).toContain(
      'work_management',
    );
    expect(filterModulesByComplexity(recommended, 'simple', persona)).not.toContain(
      'work_management',
    );
  });
});
