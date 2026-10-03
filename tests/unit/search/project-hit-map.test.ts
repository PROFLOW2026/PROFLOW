import { describe, expect, it } from 'vitest';
import { mapClaimSearchHit, mapContractorSearchHit } from '@/modules/search/domain/project-hit-map';

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

describe('project search hit mapping', () => {
  it('omits money fields for an operational viewer', () => {
    const contractor = mapContractorSearchHit(
      {
        agreementId: '33333333-3333-4333-8333-333333333333',
        projectId: PROJECT_ID,
        vendorName: 'קבלן חשמל',
        agreementTitle: 'עבודות חשמל',
        status: 'active',
        projectName: 'מגדל',
        amount: '15000.00',
        currency: 'ILS',
      },
      false,
    );
    const claim = mapClaimSearchHit(
      {
        id: '44444444-4444-4444-8444-444444444444',
        projectId: PROJECT_ID,
        claimNumber: 4,
        title: 'חשבון אפריל',
        status: 'submitted',
        projectName: 'מגדל',
        periodStart: '2026-04-01',
        amount: '8800.50',
        currency: 'ILS',
      },
      false,
    );

    for (const hit of [contractor, claim]) {
      expect(hit).not.toHaveProperty('amount');
      expect(hit).not.toHaveProperty('currency');
      expect(JSON.stringify(hit)).not.toContain('15000.00');
      expect(JSON.stringify(hit)).not.toContain('8800.50');
      expect(JSON.stringify(hit)).not.toContain('ILS');
    }
    expect(contractor.href).toContain(PROJECT_ID);
    expect(contractor.title).toBe('קבלן חשמל');
    expect(claim.href).toBe(`/projects/${PROJECT_ID}/claims/44444444-4444-4444-8444-444444444444`);
  });

  it('keeps contract money only when the viewer may see it', () => {
    const hit = mapContractorSearchHit(
      {
        agreementId: '33333333-3333-4333-8333-333333333333',
        projectId: PROJECT_ID,
        vendorName: 'קבלן חשמל',
        agreementTitle: 'עבודות חשמל',
        status: 'active',
        projectName: 'מגדל',
        amount: '15000.00',
        currency: 'ILS',
      },
      true,
    );
    expect(hit.amount).toBe('15000.00');
    expect(hit.currency).toBe('ILS');
  });
});
