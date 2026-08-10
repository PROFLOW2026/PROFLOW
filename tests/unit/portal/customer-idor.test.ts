import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertNoSensitiveCustomerFields,
  buildCustomerPortalSession,
  buildCustomerSafeDocuments,
  buildCustomerSafeProjectSummary,
  CUSTOMER_PORTAL_NEVER_EXPOSED,
  grantCoversProject,
  grantIsActive,
  isCustomerPortalSession,
} from '@/modules/portal/domain/safe-project-summary';
import type { ExternalAccessGrantRecord } from '@/modules/portal/domain/types';

function makeCustomerGrant(
  overrides: Partial<ExternalAccessGrantRecord> = {},
): ExternalAccessGrantRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    principalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    portalKind: 'customer',
    clientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    projectId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    vendorId: null,
    scopes: ['project.summary', 'billing.outstanding', 'documents.read'],
    status: 'active',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('customer portal IDOR / cross-customer', () => {
  it('denies grant for a different project and client (cross-customer)', () => {
    const grant = makeCustomerGrant({
      projectId: 'project-a',
      clientId: 'client-a',
    });
    expect(
      grantCoversProject(grant, { id: 'project-b', clientId: 'client-b' }),
    ).toBe(false);
  });

  it('denies client-scoped grant when project belongs to another client', () => {
    const grant = makeCustomerGrant({ projectId: null, clientId: 'client-a' });
    expect(
      grantCoversProject(grant, { id: 'project-x', clientId: 'client-b' }),
    ).toBe(false);
  });

  it('allows project-scoped grant only for that project', () => {
    const grant = makeCustomerGrant({
      projectId: 'project-a',
      clientId: null,
    });
    expect(grantCoversProject(grant, { id: 'project-a', clientId: 'c1' })).toBe(true);
    expect(grantCoversProject(grant, { id: 'project-b', clientId: 'c1' })).toBe(false);
  });

  it('treats revoked / expired grants as inactive (no lateral access)', () => {
    expect(
      grantIsActive(makeCustomerGrant({ status: 'revoked', revokedAt: new Date() })),
    ).toBe(false);
    expect(
      grantIsActive(
        makeCustomerGrant({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
      ),
    ).toBe(false);
  });

  it('builds ExternalPrincipal sessions that are not memberships', () => {
    const session = buildCustomerPortalSession({
      grant: makeCustomerGrant(),
      principalEmail: 'customer@external.test',
    });
    expect(isCustomerPortalSession(session)).toBe(true);
    expect(session.kind).toBe('customer_portal');
    expect(session).not.toHaveProperty('roleKey');
    expect(session).not.toHaveProperty('membershipId');
    expect(session).not.toHaveProperty('permissions');
  });

  it('rejects building a customer session from a vendor grant', () => {
    expect(() =>
      buildCustomerPortalSession({
        grant: makeCustomerGrant({ portalKind: 'vendor', vendorId: 'v1' }),
        principalEmail: 'x@y.z',
      }),
    ).toThrow(DomainRuleError);
  });

  it('never exposes profit / margin / true cost / overhead / admin / audit / storage', () => {
    expect(CUSTOMER_PORTAL_NEVER_EXPOSED).toEqual(
      expect.arrayContaining([
        'profit',
        'margin',
        'trueCost',
        'overhead',
        'vendorConfidential',
        'admin',
        'audit',
        'storagePath',
        'internalNotes',
        'supplierPricing',
      ]),
    );

    const summary = buildCustomerSafeProjectSummary({
      projectId: 'p1',
      name: 'Site',
      status: 'active',
      progressPercent: '10',
      progressStatus: 'on_track',
      startDate: null,
      targetEndDate: null,
      location: null,
      description: null,
      clientName: 'Acme',
      outstanding: { amount: '100.00', currency: 'ILS' },
      documents: [
        {
          documentId: 'd1',
          filename: 'plan.pdf',
          label: 'Plan',
          mimeType: 'application/pdf',
          sizeBytes: 12,
        },
      ],
      scopes: ['project.summary', 'billing.outstanding', 'documents.read'],
    });

    expect(summary.outstanding).toEqual({ amount: '100.00', currency: 'ILS' });
    expect(summary.documents).toHaveLength(1);
    expect(summary.documents![0]).not.toHaveProperty('storagePath');
    expect(() =>
      assertNoSensitiveCustomerFields(summary as unknown as Record<string, unknown>),
    ).not.toThrow();
  });

  it('strips storage internals and keeps only portal-shared documents', () => {
    const docs = buildCustomerSafeDocuments([
      {
        id: 'doc-1',
        originalFilename: 'spec.pdf',
        label: 'portal-shared',
        mimeType: 'application/pdf',
        sizeBytes: 99,
      },
      {
        id: 'doc-2',
        originalFilename: 'internal.pdf',
        label: null,
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toEqual({
      documentId: 'doc-1',
      filename: 'spec.pdf',
      label: 'portal-shared',
      mimeType: 'application/pdf',
      sizeBytes: 99,
    });
    expect(docs[0]).not.toHaveProperty('storageBucket');
    expect(docs[0]).not.toHaveProperty('checksum');
  });

  it('gates documents behind documents.read scope', () => {
    const without = buildCustomerSafeProjectSummary({
      projectId: 'p1',
      name: 'Site',
      status: 'active',
      progressPercent: null,
      progressStatus: null,
      startDate: null,
      targetEndDate: null,
      location: null,
      description: null,
      clientName: null,
      documents: [
        {
          documentId: 'd1',
          filename: 'hidden.pdf',
          label: 'portal-shared',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      ],
      scopes: ['project.summary'],
    });
    expect(without).not.toHaveProperty('documents');
  });
});
