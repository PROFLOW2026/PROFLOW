import { describe, expect, it, beforeEach } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertCandidateQuoteStatus,
  assertNoSensitiveVendorFields,
  assertPortalCandidateDoesNotMutateFinancialTruth,
  assertVendorGrantActive,
  assertVendorGrantHasScope,
  buildVendorPortalSession,
  buildVendorSafePoSummary,
  buildVendorSafeRfqSummary,
  isVendorPortalSession,
  isVendorVisiblePoStatus,
  portalCandidateMutatesFinancialTruth,
} from '@/modules/portal/domain/safe-vendor-projection';
import {
  assertVendorScopesAreReadOnly,
  normalizeVendorScopes,
} from '@/modules/portal/domain/vendor-scopes';
import {
  insertVendorApBillCandidate,
  insertVendorComplianceUploadCandidate,
  listVendorApBillCandidatesForVendor,
  resetVendorPortalCandidateStoreForTests,
} from '@/modules/portal/data/vendor-portal-candidates.store';
import type { ExternalAccessGrantRecord } from '@/modules/portal/domain/types';

function makeGrant(
  overrides: Partial<ExternalAccessGrantRecord> = {},
): ExternalAccessGrantRecord {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    organizationId: '22222222-2222-2222-2222-222222222222',
    principalId: '33333333-3333-3333-3333-333333333333',
    portalKind: 'vendor',
    clientId: null,
    projectId: null,
    vendorId: '44444444-4444-4444-4444-444444444444',
    scopes: ['vendor.summary', 'bill.candidate', 'documents.upload', 'rfq.read', 'po.view'],
    status: 'active',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('vendor portal scopes', () => {
  it('keeps only known vendor scopes', () => {
    expect(
      normalizeVendorScopes([
        'vendor.summary',
        'cost.write',
        'documents.read',
        'bill.candidate',
        'documents.upload',
      ]),
    ).toEqual(['vendor.summary', 'documents.read', 'bill.candidate', 'documents.upload']);
  });

  it('allows candidate intake scopes but rejects financial mutation scopes', () => {
    expect(() =>
      assertVendorScopesAreReadOnly(['vendor.summary', 'quote.submit', 'bill.candidate']),
    ).not.toThrow();
    expect(() => assertVendorScopesAreReadOnly(['documents.upload'])).not.toThrow();
    expect(() => assertVendorScopesAreReadOnly(['payment.outstanding'])).not.toThrow();
    expect(() => assertVendorScopesAreReadOnly(['expense.write'])).toThrow(DomainRuleError);
    expect(() => assertVendorScopesAreReadOnly(['ap.manage'])).toThrow(DomainRuleError);
    expect(() => assertVendorScopesAreReadOnly(['cost.write'])).toThrow(DomainRuleError);
    expect(() => assertVendorScopesAreReadOnly(['payment.write'])).toThrow(DomainRuleError);
    expect(() => assertVendorScopesAreReadOnly(['mystery.scope'])).toThrow(DomainRuleError);
  });
});

describe('vendor portal financial integrity', () => {
  beforeEach(() => {
    resetVendorPortalCandidateStoreForTests();
  });

  it('builds ExternalPrincipal sessions that are not memberships', () => {
    const session = buildVendorPortalSession({
      grant: makeGrant(),
      principalEmail: 'vendor@example.com',
    });
    expect(isVendorPortalSession(session)).toBe(true);
    expect(session.kind).toBe('vendor_portal');
    expect(session.vendorId).toBe('44444444-4444-4444-4444-444444444444');
    expect((session as { membershipId?: string }).membershipId).toBeUndefined();
  });

  it('rejects inactive or mismatched grants (cross-vendor IDOR)', () => {
    expect(() =>
      assertVendorGrantActive(makeGrant({ status: 'revoked' }), '44444444-4444-4444-4444-444444444444'),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertVendorGrantActive(makeGrant(), '55555555-5555-5555-5555-555555555555'),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertVendorGrantActive(
        makeGrant({ vendorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ),
    ).toThrow(/does not cover this vendor/i);
  });

  it('requires quote.submit scope before candidate quote intake', () => {
    expect(() =>
      assertVendorGrantHasScope(makeGrant({ scopes: ['rfq.read', 'po.view'] }), 'quote.submit'),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertVendorGrantHasScope(
        makeGrant({ scopes: ['quote.submit'] }),
        'quote.submit',
      ),
    ).not.toThrow();
  });

  it('enforces grant scopes for candidate actions', () => {
    const grant = makeGrant({ scopes: ['vendor.summary'] });
    expect(() => assertVendorGrantHasScope(grant, 'bill.candidate')).toThrow(DomainRuleError);
    expect(() => assertVendorGrantHasScope(makeGrant(), 'bill.candidate')).not.toThrow();
  });

  it('never marks portal candidates as financial truth mutations', () => {
    expect(portalCandidateMutatesFinancialTruth()).toBe(false);
    expect(() => assertPortalCandidateDoesNotMutateFinancialTruth()).not.toThrow();
    expect(() => assertCandidateQuoteStatus('received')).not.toThrow();
    expect(() => assertCandidateQuoteStatus('accepted')).toThrow(DomainRuleError);
  });

  it('stores AP bill candidates without creating ap_bills', () => {
    const candidate = insertVendorApBillCandidate({
      organizationId: 'org-1',
      vendorId: 'vendor-1',
      grantId: 'grant-1',
      principalId: 'principal-1',
      currency: 'ILS',
      totalAmount: '100',
      lines: [{ description: 'Concrete', quantity: '1', unitAmount: '100', lineTotal: '100' }],
    });
    expect(candidate.status).toBe('candidate');
    expect(candidate.mutatesFinancialTruth).toBe(false);
    expect(listVendorApBillCandidatesForVendor('org-1', 'vendor-1')).toHaveLength(1);
  });

  it('stores compliance upload candidates without posting artifacts', () => {
    const candidate = insertVendorComplianceUploadCandidate({
      organizationId: 'org-1',
      vendorId: 'vendor-1',
      grantId: 'grant-1',
      principalId: 'principal-1',
      artifactKind: 'insurance',
      name: 'Liability COI',
    });
    expect(candidate.status).toBe('candidate');
    expect(candidate.mutatesFinancialTruth).toBe(false);
  });

  it('rejects sensitive fields in vendor projections', () => {
    expect(() => assertNoSensitiveVendorFields({ profit: '1' })).toThrow(/sensitive/i);
    expect(() => assertNoSensitiveVendorFields({ employeeCost: '1' })).toThrow(/sensitive/i);
    expect(() => assertNoSensitiveVendorFields({ overhead: '1' })).toThrow(/sensitive/i);
    expect(() =>
      assertNoSensitiveVendorFields({
        purchaseOrderId: 'po-1',
        reference: 'PO-1',
        status: 'issued',
        currency: 'ILS',
        orderTotal: '10',
        orderedOn: null,
        projectName: null,
        lines: [],
      }),
    ).not.toThrow();
  });

  it('exposes only approved PO statuses to vendors', () => {
    expect(isVendorVisiblePoStatus('issued')).toBe(true);
    expect(isVendorVisiblePoStatus('partially_received')).toBe(true);
    expect(isVendorVisiblePoStatus('closed')).toBe(true);
    expect(isVendorVisiblePoStatus('draft')).toBe(false);
    expect(isVendorVisiblePoStatus('cancelled')).toBe(false);
  });

  it('builds RFQ/PO safe summaries without internal cost fields', () => {
    const rfq = buildVendorSafeRfqSummary({
      rfqId: 'rfq-1',
      title: 'Steel',
      status: 'sent',
      dueDate: '2026-08-01',
      projectName: 'Tower',
      lines: [{ description: 'Beam', quantity: '10', unit: 'ea' }],
    });
    expect(rfq.title).toBe('Steel');
    expect((rfq as { profit?: string }).profit).toBeUndefined();

    const po = buildVendorSafePoSummary({
      purchaseOrderId: 'po-1',
      reference: 'PO-9',
      status: 'issued',
      currency: 'ILS',
      orderTotal: '500',
      orderedOn: '2026-07-01',
      projectName: 'Tower',
      lines: [
        {
          description: 'Beam',
          quantity: '10',
          unitAmount: '50',
          lineTotal: '500',
          currency: 'ILS',
        },
      ],
    });
    expect(po.orderTotal).toBe('500');
    expect((po as { committedCostStatus?: string }).committedCostStatus).toBeUndefined();
  });
});
