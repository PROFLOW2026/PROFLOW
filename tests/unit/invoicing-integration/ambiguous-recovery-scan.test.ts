import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ScriptedStatutoryProvider,
  refreshExternalStatutoryStatus,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  updateExternalDocument,
} from '@/modules/invoicing-integration';
import { SumitStatutoryProvider } from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';
import type { SumitHttpClient } from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
import {
  enableExternalProviderSettingsForTests,
  resetOrgInvoicingSettingsForTests,
} from './test-external-provider-settings';

const ORG_ID = '01900000-0000-7000-8000-0000000000cc';
const BILLING_ID = '01900000-0000-7000-8000-0000000000dd';
const IDEM = 'pf:01900000-0000-7000-8000-0000000000dd:tax_invoice:v1';

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
    totalAmount: { amount: '57230.000000', currency: 'ILS' },
    paidAmount: { amount: '0.000000', currency: 'ILS' },
    outstandingAmount: { amount: '57230.000000', currency: 'ILS' },
    collectionStatus: null,
    subtotalAmount: { amount: '48500.000000', currency: 'ILS' },
    taxAmount: { amount: '8730.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    taxSnapshot: { vatMode: 'exclusive', vatRatePercent: 18 },
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
        lineTotal: { amount: '48500.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ],
    payments: [],
  })),
}));

function ctx(): OrgContext {
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
    permissions: new Set([PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE]),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function mockClient(options: {
  listDocuments?: Array<{ documentId: string; externalReference: string | null }>;
  pagingComplete?: boolean;
  candidateCapReached?: boolean;
  listThrowsOnPage?: number;
  /** When set, getdetails throws for candidates missing inline ExternalReference. */
  failGetDetailsForMissingRef?: boolean;
}): SumitHttpClient {
  let pageCalls = 0;
  return {
    async createDocument() {
      throw new Error('create must not be called during recovery scan');
    },
    async cancelDocument() {
      throw new Error('not used');
    },
    async getDocumentDetails(documentId) {
      if (options.failGetDetailsForMissingRef) {
        throw new Error('getdetails failed');
      }
      return {
        documentId,
        documentNumber: '1001',
        netAmount: '48500.000000',
        vatAmount: '8730.000000',
        grossAmount: '57230.000000',
        raw: {
          Data: {
            DocumentID: Number(documentId),
            Details: { ExternalReference: IDEM },
          },
        },
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
      pageCalls += 1;
      if (options.listThrowsOnPage != null && pageCalls === options.listThrowsOnPage) {
        throw new Error('page 500');
      }
      return {
        documents: (options.listDocuments ?? []).map((doc) => ({
          documentId: doc.documentId,
          documentType: 0,
          externalReference: doc.externalReference,
          isDraft: false,
          date: '2026-09-01',
        })),
        pagingComplete: options.pagingComplete ?? true,
        candidateCapReached: options.candidateCapReached ?? false,
        candidatesChecked: options.listDocuments?.length ?? 0,
      };
    },
  };
}

const envAbsenceProofBackup = process.env.SUMIT_ABSENCE_PROOF_ENABLED;

async function createAmbiguousRow() {
  const created = await requestExternalStatutoryDocument(ctx(), {
    billing: {
      billingRecordId: BILLING_ID,
      organizationId: ORG_ID,
      projectId: null,
      clientId: null,
      kind: 'invoice',
      status: 'finalized',
      reference: 'BR-100',
      subtotalAmount: { amount: '48500.000000', currency: 'ILS' },
      taxAmount: { amount: '8730.000000', currency: 'ILS' },
      totalAmount: { amount: '57230.000000', currency: 'ILS' },
      vatMode: 'exclusive',
      vatRatePercent: 18,
      lines: [
        {
          description: 'Services',
          lineNet: { amount: '48500.000000', currency: 'ILS' },
          quantity: null,
          unitPrice: null,
        },
      ],
      issuer: null,
      customer: {
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

describe('ambiguous recovery scan (B02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
    resetExternalDocumentsStoreForTests();
    resetOrgInvoicingSettingsForTests();
    setInvoicingIntegrationPersistenceReadyForTests(false);
    enableExternalProviderSettingsForTests();
  });

  afterEach(() => {
    setStatutoryInvoicingProviderForTests(null);
    setInvoicingIntegrationPersistenceReadyForTests(null);
    resetOrgInvoicingSettingsForTests();
    vi.useRealTimers();
    if (envAbsenceProofBackup === undefined) {
      delete process.env.SUMIT_ABSENCE_PROOF_ENABLED;
    } else {
      process.env.SUMIT_ABSENCE_PROOF_ENABLED = envAbsenceProofBackup;
    }
  });

  it('links ambiguous row when list returns matching ExternalReference (0 create calls)', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());

    const created = await createAmbiguousRow();

    const sumitProvider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockClient({
        listDocuments: [{ documentId: '9001', externalReference: IDEM }],
      }),
    });

    const refreshed = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      sumitProvider,
    );
    expect(refreshed.issuanceOutcome).toBe('confirmed_created');
    expect(refreshed.externalId).toBe('9001');
  });

  it('stays ambiguous when scan is inconclusive (cap reached)', async () => {
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());

    const created = await createAmbiguousRow();

    const sumitProvider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockClient({
        listDocuments: [],
        candidateCapReached: true,
        pagingComplete: false,
      }),
    });

    const refreshed = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      sumitProvider,
    );
    expect(refreshed.issuanceOutcome).toBe('ambiguous');
  });

  it('stays ambiguous after a single empty scan (no absence proof yet)', async () => {
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    const sumitProvider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockClient({ listDocuments: [] }),
    });

    const refreshed = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      sumitProvider,
    );
    expect(refreshed.issuanceOutcome).toBe('ambiguous');
    const scans = (refreshed.reconciliationMetadata as { absenceProofScans?: unknown[] })
      ?.absenceProofScans;
    expect(scans?.length).toBe(1);
  });

  it('propagates list HTTP failure instead of treating scan as empty proof', async () => {
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    const sumitProvider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockClient({
        listDocuments: [],
        listThrowsOnPage: 1,
      }),
    });

    await expect(
      refreshExternalStatutoryStatus(ctx(), { externalDocumentId: created.id }, sumitProvider),
    ).rejects.toThrow('page 500');
  });

  it('stays ambiguous when candidate detail lookup fails (unverified ExternalReference)', async () => {
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    const sumitProvider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockClient({
        listDocuments: [{ documentId: '8001', externalReference: null }],
        failGetDetailsForMissingRef: true,
      }),
    });

    const refreshed = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      sumitProvider,
    );
    expect(refreshed.issuanceOutcome).toBe('ambiguous');
  });

  it('stays ambiguous when automatic absence proof flag is off even after two empty scans', async () => {
    delete process.env.SUMIT_ABSENCE_PROOF_ENABLED;
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    const emptyListProvider = () =>
      new SumitStatutoryProvider({
        credentials: { companyId: 1, apiKey: 'test-key' },
        httpClient: mockClient({ listDocuments: [] }),
      });

    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      emptyListProvider(),
    );

    vi.setSystemTime(new Date('2026-09-03T20:00:00.000Z'));
    const second = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      emptyListProvider(),
    );
    expect(second.issuanceOutcome).toBe('ambiguous');
  });

  it('marks confirmed_absent after two empty scans when live-gated flag is enabled', async () => {
    process.env.SUMIT_ABSENCE_PROOF_ENABLED = 'true';
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    const emptyListProvider = () =>
      new SumitStatutoryProvider({
        credentials: { companyId: 1, apiKey: 'test-key' },
        httpClient: mockClient({ listDocuments: [] }),
      });

    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      emptyListProvider(),
    );

    vi.setSystemTime(new Date('2026-09-03T20:00:00.000Z'));
    const second = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      emptyListProvider(),
    );
    expect(second.issuanceOutcome).toBe('confirmed_rejected');
    expect(second.lastErrorCode).toBe('confirmed_absent');
  });

  it('marks confirmed_absent on scan when manual absence metadata is present (OD-32)', async () => {
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    await updateExternalDocument(ctx(), created.id, {
      reconciliationMetadata: {
        expectedNet: '48500.000000',
        expectedVat: '8730.000000',
        expectedGross: '57230.000000',
        currency: 'ILS',
        comparedAt: '2026-09-01T00:00:00.000Z',
        tolerance: '0.01',
        manualAbsenceConfirmedAt: '2026-09-02T08:00:00.000Z',
      },
    });

    const sumitProvider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockClient({ listDocuments: [] }),
    });

    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const refreshed = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      sumitProvider,
    );
    expect(refreshed.issuanceOutcome).toBe('confirmed_rejected');
    expect(refreshed.lastErrorCode).toBe('confirmed_absent');
  });

  it('stays ambiguous when empty scans occur within 24h of original issuance', async () => {
    process.env.SUMIT_ABSENCE_PROOF_ENABLED = 'true';
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
    const created = await createAmbiguousRow();

    const emptyListProvider = () =>
      new SumitStatutoryProvider({
        credentials: { companyId: 1, apiKey: 'test-key' },
        httpClient: mockClient({ listDocuments: [] }),
      });

    vi.setSystemTime(new Date('2026-09-01T18:00:00.000Z'));
    await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      emptyListProvider(),
    );

    vi.setSystemTime(new Date('2026-09-02T02:00:00.000Z'));
    const second = await refreshExternalStatutoryStatus(
      ctx(),
      { externalDocumentId: created.id },
      emptyListProvider(),
    );
    expect(second.issuanceOutcome).toBe('ambiguous');
  });
});
