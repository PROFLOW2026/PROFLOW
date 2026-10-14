import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError, ValidationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ScriptedStatutoryProvider,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  updateExternalDocument,
} from '@/modules/invoicing-integration';
import { confirmStatutoryDocumentAbsent } from '@/modules/invoicing-integration/application/confirm-statutory-document-absent';
import {
  enableExternalProviderSettingsForTests,
  resetOrgInvoicingSettingsForTests,
} from './test-external-provider-settings';

vi.mock('@/shared/audit', async () => {
  const { AUDIT_ACTIONS, AUDIT_ACTION_VALUES } = await import('@/shared/audit/actions');
  return {
    AUDIT_ACTIONS,
    AUDIT_ACTION_VALUES,
    recordAuditEvent: vi.fn(async () => undefined),
  };
});

const ORG_ID = '01900000-0000-7000-8000-0000000000ff';
const BILLING_ID = '01900000-0000-7000-8000-0000000000f2';
const BILLING_ID_2 = '01900000-0000-7000-8000-0000000000f3';
const IDEM = `pf:${BILLING_ID}:tax_invoice:v1`;

function ctx(manage = true): OrgContext {
  return {
    userId: 'user-1',
    organizationId: ORG_ID,
    membershipId: 'm-1',
    organization: {
      id: ORG_ID,
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(
      manage ? [PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE] : [PERMISSIONS.BILLING_READ],
    ),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('manual absence confirmation (B02)', () => {
  beforeEach(() => {
    resetExternalDocumentsStoreForTests();
    resetOrgInvoicingSettingsForTests();
    setInvoicingIntegrationPersistenceReadyForTests(false);
    enableExternalProviderSettingsForTests();
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
  });

  afterEach(() => {
    setStatutoryInvoicingProviderForTests(null);
    setInvoicingIntegrationPersistenceReadyForTests(null);
    resetOrgInvoicingSettingsForTests();
  });

  async function ambiguousDoc() {
    const created = await requestExternalStatutoryDocument(ctx(), {
      billing: {
        billingRecordId: BILLING_ID,
        organizationId: ORG_ID,
        projectId: null,
        clientId: null,
        kind: 'invoice',
        status: 'finalized',
        reference: 'BR-100',
        subtotalAmount: { amount: '100.000000', currency: 'ILS' },
        taxAmount: { amount: '17.000000', currency: 'ILS' },
        totalAmount: { amount: '117.000000', currency: 'ILS' },
        vatMode: 'exclusive',
        vatRatePercent: 17,
        lines: [{ description: 'Services', lineNet: { amount: '100.000000', currency: 'ILS' }, quantity: null, unitPrice: null }],
        issuer: null,
        customer: { name: 'Client', companyNumber: null, externalIdentifier: null, email: null, phone: null, address: null, city: null, postalCode: null, noVat: false },
        issueDate: '2026-09-01',
        dueDate: null,
        notes: null,
        externalReference: IDEM,
      },
      kind: 'tax_invoice',
      idempotencyKey: IDEM,
    });
    await updateExternalDocument(ctx(), created.id, {
      issuanceOutcome: 'ambiguous',
      externalId: null,
    });
    return created;
  }

  it('requires billing.manage', async () => {
    const doc = await ambiguousDoc();
    await expect(
      confirmStatutoryDocumentAbsent(ctx(false), {
        externalDocumentId: doc.id,
        reason: 'Checked SUMIT UI — no document found',
        confirmedCheckedInSumit: true,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('requires a reason', async () => {
    const doc = await ambiguousDoc();
    await expect(
      confirmStatutoryDocumentAbsent(ctx(), {
        externalDocumentId: doc.id,
        reason: 'short',
        confirmedCheckedInSumit: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects non-ambiguous rows', async () => {
    const created = await requestExternalStatutoryDocument(ctx(), {
      billing: {
        billingRecordId: BILLING_ID_2,
        organizationId: ORG_ID,
        projectId: null,
        clientId: null,
        kind: 'invoice',
        status: 'finalized',
        reference: 'BR-101',
        subtotalAmount: { amount: '100.000000', currency: 'ILS' },
        taxAmount: { amount: '17.000000', currency: 'ILS' },
        totalAmount: { amount: '117.000000', currency: 'ILS' },
        vatMode: 'exclusive',
        vatRatePercent: 17,
        lines: [{ description: 'Services', lineNet: { amount: '100.000000', currency: 'ILS' }, quantity: null, unitPrice: null }],
        issuer: null,
        customer: { name: 'Client', companyNumber: null, externalIdentifier: null, email: null, phone: null, address: null, city: null, postalCode: null, noVat: false },
        issueDate: '2026-09-01',
        dueDate: null,
        notes: null,
        externalReference: `pf:${BILLING_ID_2}:tax_invoice:v1`,
      },
      kind: 'tax_invoice',
      idempotencyKey: `pf:${BILLING_ID_2}:tax_invoice:v1`,
    });
    await expect(
      confirmStatutoryDocumentAbsent(ctx(), {
        externalDocumentId: created.id,
        reason: 'Checked SUMIT UI — no document found',
        confirmedCheckedInSumit: true,
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('marks confirmed_absent and records audit', async () => {
    const doc = await ambiguousDoc();
    const updated = await confirmStatutoryDocumentAbsent(ctx(), {
      externalDocumentId: doc.id,
      reason: 'Checked SUMIT by date, client, amount — no document',
      confirmedCheckedInSumit: true,
    });
    expect(updated.issuanceOutcome).toBe('confirmed_rejected');
    expect(updated.lastErrorCode).toBe('confirmed_absent');
  });
});
