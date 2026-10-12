import { describe, expect, it } from 'vitest';
import { resolveDashboardLayout } from '@/modules/tenancy/domain/experience-dashboard-layout';
import {
  familyForBusinessProfile,
  resolveExperienceFamily,
} from '@/modules/tenancy/domain/experience-family';
import { isExperienceFamilyV2Active } from '@/modules/tenancy/domain/experience-v2';

describe('experience family resolution', () => {
  it('maps real estate development profile', () => {
    expect(familyForBusinessProfile('REAL_ESTATE_DEVELOPMENT')).toBe('real_estate_development');
  });

  it('promotes electrical trades to project contracting when work is project-first', () => {
    const family = resolveExperienceFamily({
      businessProfileKey: 'ELECTRICAL',
      workMix: 'projects',
      preferServiceSurface: false,
      customizationMode: 'profile',
      storedFamily: null,
      projectsPrimary: true,
    });
    expect(family).toBe('project_contracting');
  });

  it('uses owner layout for project contracting family', () => {
    const mode = resolveDashboardLayout({
      family: 'project_contracting',
      workMix: 'projects',
      preferServiceSurface: false,
      projectsPrimary: true,
    });
    expect(mode).toBe('owner_full');
  });

  it('electrical contractor on projects gets owner_full dashboard layout', () => {
    const family = resolveExperienceFamily({
      businessProfileKey: 'ELECTRICAL',
      workMix: 'projects',
      preferServiceSurface: false,
      customizationMode: 'profile',
      storedFamily: null,
      projectsPrimary: true,
    });
    expect(family).toBe('project_contracting');
    expect(
      resolveDashboardLayout({
        family,
        workMix: 'projects',
        preferServiceSurface: false,
        projectsPrimary: true,
      }),
    ).toBe('owner_full');
  });

  it('skip-all path uses all_capabilities family via profile', () => {
    const family = resolveExperienceFamily({
      businessProfileKey: 'ALL_CAPABILITIES',
      workMix: 'mixed',
      preferServiceSurface: true,
      customizationMode: 'all',
      storedFamily: null,
      projectsPrimary: false,
    });
    expect(family).toBe('all_capabilities');
  });

  it('all capabilities layout composes owner backbone', () => {
    const mode = resolveDashboardLayout({
      family: 'all_capabilities',
      workMix: 'mixed',
      preferServiceSurface: true,
      projectsPrimary: false,
    });
    expect(mode).toBe('all_capabilities');
  });

  it('experience presentation is always active (no env flag)', () => {
    expect(isExperienceFamilyV2Active(undefined)).toBe(true);
    expect(isExperienceFamilyV2Active('0')).toBe(true);
  });
});
