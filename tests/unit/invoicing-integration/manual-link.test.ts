import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ScriptedStatutoryProvider,
  createExternalDocument,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  updateExternalDocument,
} from '@/modules/invoicing-integration';
import { linkExternalStatutoryDocument } from '@/modules/invoicing-integration/application/link-external-statutory-document';
import { SumitStatutoryProvider } from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';
import type { SumitHttpClient } from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
import {
  enableExternalProviderSettingsForTests,
  resetOrgInvoicingSettingsForTests,
} from './test-external-provider-settings';

const ORG_ID = '01900000-0000-7000-8000-0000000000ee';
const BILLING_ID = '01900000-0000-7000-8000-0000000000f1';
const BILLING_ID_2 = '01900000-0000-7000-8000-0000000000f4';
const IDEM = `pf:${BILLING_ID}:tax_invoice:v1`;
const IDEM_2 = `pf:${BILLING_ID_2}:tax_invoice:v1`;

vi.mock('@/shared/audit', async () => {
  const { AUDIT_ACTIONS, AUDIT_ACTION_VALUES } = await import('@/shared/audit/actions');
  return {
    AUDIT_ACTIONS,
    AUDIT_ACTION_VALUES,
    recordAuditEvent: vi.fn(async () => undefined),
  };
});

vi.mock('@/modules/billing', () => ({
  getBillingRecord: vi.fn(async () => ({
    id: BILLING_ID,
    projectId: null,
    projectName: null,
    clientId: null,
    reference: 'BR-100',
    issueDate: '2026-09-01',
    dueDate: null,
    status: 'finalized',
    kind: 'invoice',
    totalAmount: { amount: '117.000000', currency: 'ILS' },
    paidAmount: { amount: '0.000000', currency: 'ILS' },
    outstandingAmount: { amount: '117.000000', currency: 'ILS' },
    collectionStatus: null,
    subtotalAmount: { amount: '100.000000', currency: 'ILS' },
    taxAmount: { amount: '17.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    taxSnapshot: { vatMode: 'exclusive', vatRatePercent: 17 },
    customerSnapshot: {
      name: 'Client',
      companyNumber: null,
      externalIdentifier: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    finalizedAt: new Date(),
    voidedAt: null,
    voidsBillingRecordId: null,
    externalDocumentId: null,
    notes: null,
    collectionContactedAt: null,
    collectionNextFollowUpAt: null,
    collectionPromiseToPayDate: null,
    collectionNote: null,
    lines: [
      {
        id: 'line-1',
        description: 'Services',
        lineTotal: { amount: '100.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ],
    payments: [],
  })),
}));

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

function sumitProvider(documentId: string, externalReference: string): SumitStatutoryProvider {
  const client: SumitHttpClient = {
    async createDocument() {
      throw new Error('not used');
    },
    async cancelDocument() {
      throw new Error('not used');
    },
    async getDocumentDetails() {
      return {
        documentId,
        documentNumber: '1001',
        netAmount: '100.000000',
        vatAmount: '17.000000',
        grossAmount: '117.000000',
        raw: { Data: { DocumentID: Number(documentId), Details: { ExternalReference: externalReference } } },
      };
    },
    async getDocumentPdf() {
      return { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), contentType: 'application/pdf' };
    },
    async sendDocument() {
      return;
    },
    async ping() {
      return true;
    },
    async testConnection() {
      return { ok: true };
    },
    async listExpenseDocuments() {
      return [];
    },
    async listAccountingDocuments() {
      return {
        documents: [],
        pagingComplete: true,
        candidateCapReached: false,
        candidatesChecked: 0,
      };
    },
  };
  return new SumitStatutoryProvider({
    credentials: { companyId: 1, apiKey: 'test-key' },
    httpClient: client,
  });
}

describe('manual link external statutory document (B02)', () => {
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
      idempotencyKey: IDEM,
    });
    return created;
  }

  it('requires billing.manage', async () => {
    const doc = await ambiguousDoc();
    setStatutoryInvoicingProviderForTests(sumitProvider('7001', IDEM));
    await expect(
      linkExternalStatutoryDocument(ctx(false), {
        externalDocumentId: doc.id,
        sumitDocumentId: '7001',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects when SUMIT document already linked elsewhere', async () => {
    const doc = await ambiguousDoc();
    const other = await createExternalDocument(ctx(), {
      billingRecordId: BILLING_ID_2,
      providerId: 'sumit',
      kind: 'tax_invoice',
      status: 'pending',
      issuanceOutcome: 'ambiguous',
      idempotencyKey: IDEM_2,
    });
    await updateExternalDocument(ctx(), other.id, {
      issuanceOutcome: 'ambiguous',
      externalId: null,
      idempotencyKey: IDEM_2,
    });
    setStatutoryInvoicingProviderForTests(sumitProvider('7001', IDEM));
    await linkExternalStatutoryDocument(ctx(), {
      externalDocumentId: doc.id,
      sumitDocumentId: '7001',
    });
    await expect(
      linkExternalStatutoryDocument(ctx(), {
        externalDocumentId: other.id,
        sumitDocumentId: '7001',
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('links ambiguous row and records audit on success', async () => {
    const doc = await ambiguousDoc();
    setStatutoryInvoicingProviderForTests(sumitProvider('7002', IDEM));
    const linked = await linkExternalStatutoryDocument(ctx(), {
      externalDocumentId: doc.id,
      sumitDocumentId: '7002',
    });
    expect(linked.issuanceOutcome).toBe('confirmed_created');
    expect(linked.externalId).toBe('7002');
  });

  it('rejects link when SUMIT ExternalReference mismatches idempotency key', async () => {
    const doc = await ambiguousDoc();
    setStatutoryInvoicingProviderForTests(sumitProvider('7003', 'pf:other-billing:tax_invoice:v1'));
    await expect(
      linkExternalStatutoryDocument(ctx(), {
        externalDocumentId: doc.id,
        sumitDocumentId: '7003',
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('allows explicit mismatch override for billing.manage', async () => {
    const doc = await ambiguousDoc();
    setStatutoryInvoicingProviderForTests(sumitProvider('7004', 'pf:other-billing:tax_invoice:v1'));
    const linked = await linkExternalStatutoryDocument(ctx(), {
      externalDocumentId: doc.id,
      sumitDocumentId: '7004',
      allowExternalReferenceMismatch: true,
    });
    expect(linked.externalId).toBe('7004');
    expect(linked.issuanceOutcome).toBe('confirmed_created');
  });
});
