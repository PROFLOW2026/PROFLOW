import { describe, expect, it } from 'vitest';
import { suggestUnusedCapabilities } from '@/modules/tenancy/domain/unused-capability-suggestions';
import { prioritizeReportKindsForPersona } from '@/modules/reports/domain/persona-pack-order';
import { ONBOARDING_BUSINESS_TYPES } from '@/modules/tenancy/domain/onboarding-experience';
import { getBusinessProfileSetup } from '@/modules/tenancy/domain/business-profile-setup';
import { PROJECT_TEMPLATE_KEYS } from '@/modules/projects/domain/templates';

describe('unused capability suggestions', () => {
  const now = new Date('2026-08-20T12:00:00Z');

  it('suggests enabled unused modules and skips foundations', () => {
    const suggestions = suggestUnusedCapabilities(
      [
        { moduleKey: 'billing', enabled: true, firstUsedAt: null },
        { moduleKey: 'clients', enabled: true, firstUsedAt: null },
        { moduleKey: 'workforce', enabled: true, firstUsedAt: null },
        { moduleKey: 'boq', enabled: true, firstUsedAt: null },
        { moduleKey: 'crm', enabled: false, firstUsedAt: null },
      ],
      { now },
    );
    expect(suggestions).toContain('boq');
    expect(suggestions).not.toContain('billing');
    expect(suggestions).not.toContain('clients');
    expect(suggestions).not.toContain('workforce');
    expect(suggestions).not.toContain('crm');
  });

  it('skips documents when firstUsedAt is set', () => {
    const suggestions = suggestUnusedCapabilities(
      [
        {
          moduleKey: 'documents',
          enabled: true,
          firstUsedAt: new Date('2025-01-01T00:00:00Z'),
        },
        { moduleKey: 'quotes', enabled: true, firstUsedAt: null },
      ],
      { now },
    );
    expect(suggestions).not.toContain('documents');
    expect(suggestions).toContain('quotes');
  });

  it('respects dismissals and never auto-hides', () => {
    const suggestions = suggestUnusedCapabilities(
      [{ moduleKey: 'boq', enabled: true, firstUsedAt: null }],
      { now, dismissedKeys: ['boq'] },
    );
    expect(suggestions).toEqual([]);
  });
});

describe('persona report pack order', () => {
  it('puts recommended kinds first', () => {
    const { recommended, all } = prioritizeReportKindsForPersona(
      [
        'boq_progress',
        'project_status',
        'vendor_subcontract_summary',
        'project_financial_summary',
      ],
      'project_contractor',
    );
    expect(recommended[0]).toBe('project_status');
    expect(all[0]).toBe('project_status');
    expect(all).toContain('boq_progress');
  });
});

describe('onboarding business types + templates', () => {
  it('includes plumbing, hvac, and designer', () => {
    expect(ONBOARDING_BUSINESS_TYPES).toContain('PLUMBING');
    expect(ONBOARDING_BUSINESS_TYPES).toContain('HVAC');
    expect(ONBOARDING_BUSINESS_TYPES).toContain('DESIGNER');
  });

  it('keeps projectTemplateKeys resolvable for major personas', () => {
    const allowed = new Set<string>(PROJECT_TEMPLATE_KEYS);
    for (const key of [
      'GENERAL_CONTRACTOR',
      'ELECTRICAL',
      'PLUMBING',
      'HVAC',
      'DESIGNER',
      'ARCHITECT',
      'SMALL_WORKS',
      'FIELD_SERVICE',
    ] as const) {
      const setup = getBusinessProfileSetup(key);
      expect(setup.projectTemplateKeys.length).toBeGreaterThan(0);
      expect(setup.projectTemplateKeys.every((template) => allowed.has(template))).toBe(true);
    }
  });
});
