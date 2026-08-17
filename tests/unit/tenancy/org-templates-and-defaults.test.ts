import { describe, expect, it } from 'vitest';
import {
  cloneOrgStructureTemplateForApply,
  parseOrgStructureTemplatesBag,
  previewOrgStructureTemplate,
} from '@/modules/tenancy/domain/org-structure-templates';
import {
  parseMilestoneLines,
  parseWorkPackageLines,
} from '@/modules/tenancy/application/org-structure-templates';
import { parseLaborCostDefaults } from '@/modules/tenancy/domain/labor-cost-defaults';

describe('org structure templates', () => {
  it('parses work-package lines with optional phases', () => {
    const rows = parseWorkPackageLines('Electrical | Rough-in, Finish\nPlumbing');
    expect(rows).toEqual([
      { name: 'Electrical', phases: ['Rough-in', 'Finish'] },
      { name: 'Plumbing', phases: [] },
    ]);
  });

  it('parses milestone offsets', () => {
    expect(parseMilestoneLines('Start @ 0\nHandover')).toEqual([
      { name: 'Start', offsetDaysFromStart: 0 },
      { name: 'Handover', offsetDaysFromStart: null },
    ]);
  });

  it('clones apply payload without shared refs and defaults additive fields', () => {
    const bag = parseOrgStructureTemplatesBag({
      projectTemplates: [
        {
          id: '018f1234-5678-7abc-8def-0123456789ab',
          name: 'Custom MEP',
          description: null,
          workPackages: [{ name: 'Electrical', phases: ['Rough'] }],
          milestones: [{ name: 'Done', offsetDaysFromStart: 10 }],
        },
      ],
    });
    const template = bag.projectTemplates[0]!;
    expect(template.documentFolders).toEqual([]);
    expect(template.closeoutRequirementKeys).toEqual([]);
    const copy = cloneOrgStructureTemplateForApply(template);
    expect(copy.workPackages[0]).not.toBe(template.workPackages[0]);
    expect(copy.documentFolders).not.toBe(template.documentFolders);
    expect(previewOrgStructureTemplate(template).workPackageNames).toEqual(['Electrical']);
  });
});

describe('labor cost defaults', () => {
  it('parses burden and components as copies', () => {
    const defaults = parseLaborCostDefaults({
      burdenPercent: '12.5',
      components: [{ key: 'pension', basis: 'percent', percent: '6', amount: null }],
    });
    expect(defaults.burdenPercent).toBe('12.5');
    expect(defaults.components[0]?.key).toBe('pension');
  });
});
