import { describe, expect, it } from 'vitest';
import {
  assertNoSensitiveCustomerFields,
  buildCustomerSafeBillingItems,
  buildCustomerSafeDocuments,
  buildCustomerSafeMilestones,
  buildCustomerSafeProjectSummary,
  CUSTOMER_PORTAL_NEVER_EXPOSED,
  normalizeCustomerScopes,
} from '@/modules/portal/domain/safe-project-summary';
import {
  assertNoSensitiveVendorFields,
  buildVendorSafePaymentOutstanding,
  isVendorPaymentOutstandingPolicyEnabled,
  VENDOR_PAYMENT_OUTSTANDING_POLICY,
} from '@/modules/portal/domain/safe-vendor-projection';
import {
  assertExternalPublicAccessEnabled,
  EXTERNAL_PUBLIC_ACCESS_STATUS,
  getExternalPublicAccessStatus,
  isExternalPublicAccessEnabled,
} from '@/modules/portal/domain/external-access-policy';
import { assertVendorScopesAreReadOnly } from '@/modules/portal/domain/vendor-scopes';

describe('customer safe-project-summary redaction', () => {
  it('documents never-exposed financial and internal fields', () => {
    expect(CUSTOMER_PORTAL_NEVER_EXPOSED).toEqual(
      expect.arrayContaining([
        'profit',
        'margin',
        'trueCost',
        'employeeCost',
        'overhead',
        'supplierPricing',
        'internalNotes',
      ]),
    );
  });

  it('redacts cost/margin and gates billing + milestones by scope', () => {
    const summary = buildCustomerSafeProjectSummary({
      projectId: 'p1',
      name: 'Tower',
      status: 'active',
      progressPercent: '50',
      progressStatus: 'on_track',
      startDate: '2026-01-01',
      targetEndDate: '2026-12-01',
      location: 'TLV',
      description: 'Facade',
      clientName: 'Acme',
      outstanding: { amount: '1000.00', currency: 'ILS' },
      billing: {
        invoicedAmount: '5000.00',
        paidAmount: '4000.00',
        currency: 'ILS',
        items: [],
      },
      milestones: [
        {
          milestoneId: 'm1',
          name: 'Foundation',
          status: 'achieved',
          targetDate: '2026-03-01',
          completedAt: '2026-03-02',
        },
      ],
      documents: [
        {
          documentId: 'd1',
          filename: 'plan.pdf',
          label: 'portal-shared',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      ],
      scopes: ['project.summary'],
    });

    expect(summary).not.toHaveProperty('outstanding');
    expect(summary).not.toHaveProperty('billing');
    expect(summary).not.toHaveProperty('milestones');
    expect(summary).not.toHaveProperty('documents');
    expect(summary).not.toHaveProperty('profit');
    expect(summary).not.toHaveProperty('margin');
    expect(summary).not.toHaveProperty('trueCost');
    expect(() =>
      assertNoSensitiveCustomerFields(summary as unknown as Record<string, unknown>),
    ).not.toThrow();

    const scoped = buildCustomerSafeProjectSummary({
      ...summary,
      outstanding: { amount: '1000.00', currency: 'ILS' },
      billing: {
        invoicedAmount: '5000.00',
        paidAmount: '4000.00',
        currency: 'ILS',
        items: [],
      },
      milestones: [
        {
          milestoneId: 'm1',
          name: 'Foundation',
          status: 'achieved',
          targetDate: '2026-03-01',
          completedAt: '2026-03-02',
        },
      ],
      scopes: ['project.summary', 'billing.outstanding', 'milestones.read'],
    });
    expect(scoped.outstanding?.amount).toBe('1000.00');
    expect(scoped.billing?.invoicedAmount).toBe('5000.00');
    expect(scoped.milestones?.[0]?.name).toBe('Foundation');
    expect(scoped.milestones?.[0]).not.toHaveProperty('notes');
  });

  it('strips internal milestone notes and rejects sensitive keys', () => {
    const milestones = buildCustomerSafeMilestones([
      {
        id: 'm1',
        name: 'Roof',
        status: 'planned',
        targetDate: '2026-08-01',
        completedAt: null,
        notes: 'INTERNAL — margin risk',
      },
    ]);
    expect(milestones[0]).toEqual({
      milestoneId: 'm1',
      name: 'Roof',
      status: 'planned',
      targetDate: '2026-08-01',
      completedAt: null,
    });
    expect(milestones[0]).not.toHaveProperty('notes');
    expect(() => assertNoSensitiveCustomerFields({ notes: 'x' })).toThrow(/sensitive/i);
    expect(() => assertNoSensitiveCustomerFields({ profit: '1' })).toThrow(/sensitive/i);
    expect(() => assertNoSensitiveCustomerFields({ employeeCost: '1' })).toThrow(/sensitive/i);
    expect(() => assertNoSensitiveCustomerFields({ supplierPricing: '1' })).toThrow(/sensitive/i);
  });

  it('builds billing items without draft/void or payment notes', () => {
    const items = buildCustomerSafeBillingItems([
      {
        id: 'b1',
        reference: 'INV-1',
        kind: 'invoice',
        status: 'finalized',
        issueDate: '2026-01-01',
        dueDate: '2026-02-01',
        totalAmount: '100.00',
        paidAmount: '40.00',
        outstandingAmount: '60.00',
        currency: 'ILS',
        payments: [
          {
            amount: '40.00',
            currency: 'ILS',
            status: 'recorded',
            paymentDate: '2026-01-15',
            reference: 'RCPT-1',
          },
          {
            amount: '10.00',
            currency: 'ILS',
            status: 'void',
            paymentDate: '2026-01-16',
            reference: 'VOID',
          },
        ],
      },
      {
        id: 'b2',
        reference: 'DRAFT',
        kind: 'invoice',
        status: 'draft',
        issueDate: null,
        dueDate: null,
        totalAmount: '9.00',
        paidAmount: '0',
        outstandingAmount: '9.00',
        currency: 'ILS',
        payments: [],
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.payments).toHaveLength(1);
    expect(items[0]).not.toHaveProperty('notes');
  });

  it('normalizes grant scopes and drops unknown / cost scopes', () => {
    expect(
      normalizeCustomerScopes([
        'project.summary',
        'cost.read',
        'milestones.read',
        'profit.view',
        'billing.outstanding',
      ]),
    ).toEqual(['project.summary', 'milestones.read', 'billing.outstanding']);
  });

  it('excludes non-shared documents from customer projection builders', () => {
    expect(
      buildCustomerSafeDocuments([
        {
          id: 'd1',
          originalFilename: 'a.pdf',
          label: 'internal',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      ]),
    ).toHaveLength(0);
    expect(
      buildCustomerSafeDocuments([
        {
          id: 'd1',
          originalFilename: 'a.pdf',
          label: 'portal-shared: schedule',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      ]),
    ).toHaveLength(1);
    expect(
      buildCustomerSafeDocuments([
        {
          id: 'd2',
          originalFilename: 'b.pdf',
          label: 'internal',
          portalVisible: true,
          mimeType: 'application/pdf',
          sizeBytes: 2,
        },
      ]),
    ).toHaveLength(1);
    expect(
      buildCustomerSafeDocuments([
        {
          id: 'd3',
          originalFilename: 'c.pdf',
          label: null,
          portalVisible: false,
          mimeType: 'application/pdf',
          sizeBytes: 3,
        },
      ]),
    ).toHaveLength(0);
  });
});

describe('vendor grant scope + payment policy', () => {
  it('allows payment.outstanding but rejects payment mutation scopes', () => {
    expect(() =>
      assertVendorScopesAreReadOnly(['vendor.summary', 'payment.outstanding', 'bill.candidate']),
    ).not.toThrow();
    expect(() => assertVendorScopesAreReadOnly(['payment.write'])).toThrow();
    expect(() => assertVendorScopesAreReadOnly(['payment.record'])).toThrow();
  });

  it('keeps vendor payment outstanding policy disabled', () => {
    expect(VENDOR_PAYMENT_OUTSTANDING_POLICY).toBe('disabled');
    expect(isVendorPaymentOutstandingPolicyEnabled()).toBe(false);
    const projection = buildVendorSafePaymentOutstanding({
      currency: 'ILS',
      billedAmount: '100',
      paidAmount: '20',
      outstandingAmount: '80',
    });
    expect(projection.policyStatus).toBe('disabled');
    expect(projection.outstandingAmount).toBeNull();
    expect(() =>
      assertNoSensitiveVendorFields(projection as unknown as Record<string, unknown>),
    ).not.toThrow();
  });
});

describe('external public access disabled', () => {
  it('keeps public portal login disabled', () => {
    expect(EXTERNAL_PUBLIC_ACCESS_STATUS).toBe('disabled');
    expect(isExternalPublicAccessEnabled()).toBe(false);
    expect(getExternalPublicAccessStatus().enabled).toBe(false);
    expect(() => assertExternalPublicAccessEnabled()).toThrow(/disabled/i);
  });
});
