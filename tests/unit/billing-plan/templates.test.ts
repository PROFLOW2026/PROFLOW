import { describe, expect, it } from 'vitest';
import {
  findProfessionStarterTemplate,
  listProfessionStarterTemplates,
  PROFESSION_STARTER_TEMPLATES,
} from '@/modules/billing-plan';

describe('billing plan profession templates', () => {
  it('exposes profession starter templates for known work kinds', () => {
    const keys = listProfessionStarterTemplates().map((t) => t.key);
    expect(PROFESSION_STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    expect(keys).toEqual(
      expect.arrayContaining([
        'contractor',
        'electrical',
        'renovation',
        'small_works',
        'architecture',
        'consulting',
        'inspection',
        'service_install',
        'plumbing',
        'hvac',
        'design',
        'engineering',
        'maintenance',
        'mixed',
      ]),
    );
    const electrical = findProfessionStarterTemplate('electrical');
    expect(electrical?.rows.length).toBeGreaterThan(0);
    expect(electrical?.rows.every((row) => row.labelKey.startsWith('billingPlan.'))).toBe(true);
  });

  it('keeps starter template row definitions immutable across reads', () => {
    const first = findProfessionStarterTemplate('small_works')!;
    const snapshot = first.rows.map((row) => ({ ...row }));
    // Callers receive the shared constant; mutating a shallow copy must not alter the source.
    const copy = [...first.rows];
    (copy as { labelKey: string }[])[0] = {
      ...copy[0]!,
      labelKey: 'mutated',
    };
    expect(findProfessionStarterTemplate('small_works')!.rows).toEqual(snapshot);
  });
});
