import { describe, expect, it } from 'vitest';
import {
  defaultManagementModeForProfile,
  resolveInitialManagementMode,
} from '@/modules/tenancy/domain/business-profiles';
import {
  PROFILE_TASK_TEMPLATE_SEEDS,
  profileTaskTemplateTitle,
} from '@/modules/tenancy/domain/profile-task-template-seeds';

describe('profile defaults (U11)', () => {
  it('GENERAL_CONTRACTOR defaults to developer_gc management mode', () => {
    expect(defaultManagementModeForProfile('GENERAL_CONTRACTOR')).toBe('developer_gc');
    expect(
      resolveInitialManagementMode({
        profileKey: 'GENERAL_CONTRACTOR',
        suggestedDefaults: null,
      }),
    ).toBe('developer_gc');
  });

  it('SUBCONTRACTOR defaults to execution_contractor', () => {
    expect(defaultManagementModeForProfile('SUBCONTRACTOR')).toBe('execution_contractor');
  });

  it('U11 expanded profiles include task template seeds', () => {
    for (const key of [
      'RENOVATION',
      'ELECTRICAL',
      'PLUMBING',
      'HVAC',
      'FIELD_SERVICE',
      'SUBCONTRACTOR',
    ] as const) {
      expect(PROFILE_TASK_TEMPLATE_SEEDS[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('profile task template titles are non-empty in four locales', () => {
    const locales = ['he-IL', 'en', 'ar', 'ru'] as const;
    for (const seeds of Object.values(PROFILE_TASK_TEMPLATE_SEEDS)) {
      for (const seed of seeds ?? []) {
        for (const locale of locales) {
          expect(profileTaskTemplateTitle(seed, locale).trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
