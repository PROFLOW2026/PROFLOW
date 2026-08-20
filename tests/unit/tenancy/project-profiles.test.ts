import { describe, expect, it } from 'vitest';
import {
  PROJECT_EXPERIENCE_PROFILE_KEYS,
  PROJECT_PROFILE_TAB_ALLOWLIST,
  isProjectExperienceProfileKey,
  projectProfileAllowsTab,
  resolveProjectExperienceProfile,
} from '@/modules/tenancy';

describe('project experience profiles', () => {
  it('exposes the six known profile keys', () => {
    expect(PROJECT_EXPERIENCE_PROFILE_KEYS).toEqual([
      'simple',
      'full',
      'boq',
      'consulting',
      'service_installation',
      'small_job',
    ]);
  });

  it('validates stored keys and rejects unknown values', () => {
    expect(isProjectExperienceProfileKey('simple')).toBe(true);
    expect(isProjectExperienceProfileKey('full')).toBe(true);
    expect(isProjectExperienceProfileKey(null)).toBe(false);
    expect(isProjectExperienceProfileKey('')).toBe(false);
    expect(isProjectExperienceProfileKey('unknown')).toBe(false);
  });

  it('prefers an explicit stored profile over derivation', () => {
    expect(
      resolveProjectExperienceProfile({
        stored: 'simple',
        workKind: 'job',
        businessProfileKey: 'GENERAL_CONTRACTOR',
        boqModuleEnabled: true,
      }),
    ).toBe('simple');
  });

  it('derives from work kind when stored is null', () => {
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'job',
      }),
    ).toBe('small_job');
    expect(
      resolveProjectExperienceProfile({
        stored: undefined,
        workKind: 'work_order',
      }),
    ).toBe('service_installation');
  });

  it('derives consulting / simple / boq / full from org profile and BOQ module', () => {
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'ARCHITECT',
      }),
    ).toBe('consulting');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'DESIGNER',
      }),
    ).toBe('consulting');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'ENGINEERING_CONSULTANT',
      }),
    ).toBe('consulting');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'PROJECT_MANAGEMENT',
      }),
    ).toBe('consulting');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'SMALL_WORKS',
      }),
    ).toBe('simple');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'GENERAL_CONTRACTOR',
      }),
    ).toBe('boq');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        boqModuleEnabled: true,
      }),
    ).toBe('boq');
    expect(
      resolveProjectExperienceProfile({
        stored: null,
        workKind: 'project',
        businessProfileKey: 'ELECTRICAL',
        boqModuleEnabled: false,
      }),
    ).toBe('full');
  });

  it('allowlists tabs per profile without inventing capabilities', () => {
    expect(projectProfileAllowsTab('simple', 'expenses')).toBe(true);
    expect(projectProfileAllowsTab('simple', 'financials')).toBe(false);
    expect(projectProfileAllowsTab('simple', 'time')).toBe(false);
    expect(projectProfileAllowsTab('simple', 'boq')).toBe(false);
    expect(projectProfileAllowsTab('simple', 'closeout')).toBe(false);
    expect(projectProfileAllowsTab('small_job', 'expenses')).toBe(true);
    expect(projectProfileAllowsTab('small_job', 'time')).toBe(false);
    expect(projectProfileAllowsTab('small_job', 'financials')).toBe(false);
    expect(projectProfileAllowsTab('consulting', 'schedule')).toBe(true);
    expect(projectProfileAllowsTab('consulting', 'work')).toBe(true);
    expect(projectProfileAllowsTab('consulting', 'boq')).toBe(false);
    expect(projectProfileAllowsTab('service_installation', 'usage')).toBe(true);
    expect(projectProfileAllowsTab('service_installation', 'changes')).toBe(false);
    expect(projectProfileAllowsTab('boq', 'warranty')).toBe(true);
    expect(projectProfileAllowsTab('full', 'closeout')).toBe(true);

    for (const key of PROJECT_EXPERIENCE_PROFILE_KEYS) {
      expect(PROJECT_PROFILE_TAB_ALLOWLIST[key].size).toBeGreaterThan(0);
    }
  });
});
