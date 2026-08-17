import { describe, expect, it } from 'vitest';
import {
  cloneProjectTemplateForApply,
  getProjectTemplate,
  offsetBusinessDate,
  previewProjectTemplate,
  PROJECT_TEMPLATE_KEYS,
} from '@/modules/projects/domain/templates';

describe('project structure templates', () => {
  it('exposes starter templates including 2.0 keys', () => {
    expect(PROJECT_TEMPLATE_KEYS).toEqual(
      expect.arrayContaining([
        'simple_finish',
        'apartment_renovation',
        'electrical_project',
        'maintenance_contract',
        'architecture_project',
        'consulting_engagement',
        'service_installation',
      ]),
    );
    expect(PROJECT_TEMPLATE_KEYS).toHaveLength(10);
    expect(getProjectTemplate('residential_mep')?.workPackages.length).toBe(3);
    expect(getProjectTemplate('apartment_renovation')?.closeoutRequirementKeys).toContain(
      'handover_photos',
    );
  });

  it('previews localized names without mutating catalog', () => {
    const preview = previewProjectTemplate('design_studio', 'he-IL');
    expect(preview?.name).toBe('סטודיו תכנון');
    expect(preview?.workPackageNames).toContain('קונספט');
    expect(preview?.folderNames.length).toBeGreaterThan(0);
    expect(getProjectTemplate('design_studio')?.nameHe).toBe('סטודיו תכנון');
  });

  it('clones an apply payload as independent copies including extras', () => {
    const copy = cloneProjectTemplateForApply('simple_finish', 'en');
    expect(copy).not.toBeNull();
    expect(copy!.workPackages[0]?.name).toBe('Rough-in');
    expect(copy!.documentFolders.length).toBeGreaterThan(0);
    expect(copy!.closeoutRequirementKeys).toContain('handover_photos');
    const again = cloneProjectTemplateForApply('simple_finish', 'en');
    expect(again!.workPackages).not.toBe(copy!.workPackages);
    expect(again!.milestones[0]).not.toBe(copy!.milestones[0]);
    expect(again!.documentFolders).not.toBe(copy!.documentFolders);
  });

  it('offsets milestone target dates from project start', () => {
    expect(offsetBusinessDate('2026-08-01', 14)).toBe('2026-08-15');
    expect(offsetBusinessDate(null, 14)).toBeNull();
  });
});
