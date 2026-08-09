import { describe, expect, it } from 'vitest';
import {
  cloneProjectTemplateForApply,
  getProjectTemplate,
  offsetBusinessDate,
  previewProjectTemplate,
  PROJECT_TEMPLATE_KEYS,
} from '@/modules/projects/domain/templates';

describe('project structure templates', () => {
  it('exposes starter templates', () => {
    expect(PROJECT_TEMPLATE_KEYS.length).toBeGreaterThanOrEqual(4);
    expect(getProjectTemplate('residential_mep')?.workPackages.length).toBe(3);
  });

  it('previews localized names without mutating catalog', () => {
    const preview = previewProjectTemplate('design_studio', 'he-IL');
    expect(preview?.name).toBe('סטודיו תכנון');
    expect(preview?.workPackageNames).toContain('קונספט');
    expect(getProjectTemplate('design_studio')?.nameHe).toBe('סטודיו תכנון');
  });

  it('clones an apply payload as independent copies', () => {
    const copy = cloneProjectTemplateForApply('simple_finish', 'en');
    expect(copy).not.toBeNull();
    expect(copy!.workPackages[0]?.name).toBe('Rough-in');
    const again = cloneProjectTemplateForApply('simple_finish', 'en');
    expect(again!.workPackages).not.toBe(copy!.workPackages);
    expect(again!.milestones[0]).not.toBe(copy!.milestones[0]);
  });

  it('offsets milestone target dates from project start', () => {
    expect(offsetBusinessDate('2026-08-01', 14)).toBe('2026-08-15');
    expect(offsetBusinessDate(null, 14)).toBeNull();
  });
});
