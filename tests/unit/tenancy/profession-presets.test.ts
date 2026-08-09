import { describe, expect, it } from 'vitest';
import {
  getProfessionPreset,
  PROFESSION_PRESET_KEYS,
} from '@/modules/tenancy/domain/profession-presets';
import { suggestedWorkPackageNames } from '@/modules/tenancy/application/apply-profession-preset';

describe('profession presets', () => {
  it('exposes the six starter professions', () => {
    expect(PROFESSION_PRESET_KEYS).toHaveLength(6);
    expect(getProfessionPreset('electrician')?.domains[0]?.key).toBe('electrical');
  });

  it('returns editable work-package name suggestions without binding history', () => {
    expect(suggestedWorkPackageNames('architect', 'en')).toContain('Concept');
    expect(suggestedWorkPackageNames('architect', 'he-IL').length).toBeGreaterThan(0);
    expect(suggestedWorkPackageNames(null)).toEqual([]);
  });
});
