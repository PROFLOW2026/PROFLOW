import { describe, expect, it, beforeEach } from 'vitest';
import {
  insertVendorApBillCandidate,
  reviewVendorApBillCandidate,
  resetVendorPortalCandidateStoreForTests,
} from '@/modules/portal/data/vendor-portal-candidates.store';

describe('vendor portal candidate review store', () => {
  beforeEach(() => {
    resetVendorPortalCandidateStoreForTests();
  });

  it('reviews candidates without mutating financial truth', () => {
    const candidate = insertVendorApBillCandidate({
      organizationId: 'org-1',
      vendorId: 'vendor-1',
      grantId: 'grant-1',
      principalId: 'principal-1',
      currency: 'ILS',
      totalAmount: '100.00',
      lines: [{ description: 'Line', quantity: '1', unitAmount: '100.00', lineTotal: '100.00' }],
    });

    expect(candidate.status).toBe('candidate');
    expect(candidate.mutatesFinancialTruth).toBe(false);

    const reviewed = reviewVendorApBillCandidate({
      organizationId: 'org-1',
      candidateId: candidate.id,
      decision: 'accepted_for_review',
      reviewNote: 'Looks plausible',
    });

    expect(reviewed?.status).toBe('accepted_for_review');
    expect(reviewed?.mutatesFinancialTruth).toBe(false);
    expect(reviewed?.reviewNote).toBe('Looks plausible');
  });
});
