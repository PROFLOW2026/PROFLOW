import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ScriptedStatutoryProvider,
  assertIssuanceEligible,
  buildStatutoryIdempotencyKey,
  findExternalDocumentById,
  listExternalDocumentsForBilling,
  requestExternalStatutoryDocument,
  requestExternalStatutoryDocumentCommitted,
  resetExternalDocumentsStoreForTests,
  setCommittedPhaseRunnerForTests,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  type BillingRecordBridgeRef,
  type CreateExternalDocumentInput,
  type CreateExternalDocumentOutput,
  type StatutoryInvoicingProvider,
  type StatutoryProviderResult,
} from '@/modules/invoicing-integration';
import { SumitStatutoryProvider } from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';
import type { SumitHttpClient } from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const USER_ID = 'user-issuance-durability';
const BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';

vi.mock('@/modules/billing', () => ({
  getBillingRecord: vi.fn(async () => ({
    id: BILLING_ID,
    projectId: null,
    projectName: null,
    clientId: null,
    reference: 'BR-100',
    issueDate: '2026-09-18',
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
      name: 'Demo Customer',
      companyNumber: null,
      externalIdentifier: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    finalizedAt: new Date('2026-09-18T00:00:00.000Z'),
    voidedAt: null,
    voidsBillingRecordId: null,
    externalDocumentId: null,
    notes: null,
    lines: [],
    payments: [],
  })),
}));

function contextWithManage(): OrgContext {
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    membershipId: 'membership-1',
    organization: {
      id: ORG_ID,
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set([PERMISSIONS.BILLING_MANAGE, PERMISSIONS.BILLING_READ]),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function bridge(overrides: Partial<BillingRecordBridgeRef> = {}): BillingRecordBridgeRef {
  return {
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
    lines: [],
    issuer: null,
    customer: {
      name: 'Demo Customer',
      companyNumber: null,
      externalIdentifier: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    issueDate: '2026-09-18',
    dueDate: null,
    notes: null,
    externalReference: buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice'),
    ...overrides,
  };
}

class RejectingStatutoryProvider implements StatutoryInvoicingProvider {
  readonly id = 'scripted-test';

  isConfigured(): boolean {
    return true;
  }

  isFeatureEnabled(): boolean {
    return true;
  }

  async createDocument(
    _input: CreateExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreateExternalDocumentOutput>> {
    return {
      ok: false,
      errorCode: 'provider_error',
      message: 'SUMIT rejected create',
    };
  }

  async retrieveStatus(): Promise<StatutoryProviderResult<never>> {
    return { ok: false as const, errorCode: 'unsupported', message: 'unsupported' };
  }

  async creditDocument(): Promise<StatutoryProviderResult<never>> {
    return { ok: false as const, errorCode: 'unsupported', message: 'unsupported' };
  }

  async cancelDocument(): Promise<StatutoryProviderResult<never>> {
    return { ok: false as const, errorCode: 'unsupported', message: 'unsupported' };
  }

  async allocateReference(): Promise<StatutoryProviderResult<never>> {
    return { ok: false as const, errorCode: 'unsupported', message: 'unsupported' };
  }
}

function mockSumitClient(options: {
  createDocumentId: string;
  getDetailsFails?: boolean;
}): SumitHttpClient {
  return {
    async createDocument() {
      return {
        documentId: options.createDocumentId,
        documentNumber: '1001',
        netAmount: null,
        vatAmount: null,
        grossAmount: null,
        raw: {},
      };
    },
    async getDocumentDetails() {
      if (options.getDetailsFails) {
        throw new Error('getdetails unavailable');
      }
      return {
        documentId: options.createDocumentId,
        documentNumber: '1001',
        netAmount: '48500.000000',
        vatAmount: '8730.000000',
        grossAmount: '57230.000000',
        raw: {},
      };
    },
    async ping() {
      return true;
    },
    async testConnection() {
      return { ok: true, environment: 'test' as const };
    },
  };
}

describe('external statutory issuance durability', () => {
  beforeEach(() => {
    setInvoicingIntegrationPersistenceReadyForTests(false);
    resetExternalDocumentsStoreForTests();
    setCommittedPhaseRunnerForTests(async (_userId, _organizationId, fn) =>
      fn(contextWithManage()),
    );
  });

  afterEach(() => {
    setInvoicingIntegrationPersistenceReadyForTests(null);
    setStatutoryInvoicingProviderForTests(null);
    setCommittedPhaseRunnerForTests(null);
  });

  it('lock survives thrown UI error via committed phases', async () => {
    setStatutoryInvoicingProviderForTests(new RejectingStatutoryProvider());

    await expect(
      requestExternalStatutoryDocumentCommitted(USER_ID, ORG_ID, BILLING_ID),
    ).rejects.toBeInstanceOf(DomainRuleError);

    const docs = listExternalDocumentsForBilling(ORG_ID, BILLING_ID);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.issuanceOutcome).toBe('confirmed_rejected');
    expect(docs[0]?.status).toBe('cancelled');
  });

  it('confirmed_rejected remains confirmed_rejected when UI error is thrown', async () => {
    setStatutoryInvoicingProviderForTests(new RejectingStatutoryProvider());

    try {
      await requestExternalStatutoryDocumentCommitted(USER_ID, ORG_ID, BILLING_ID);
    } catch {
      // expected
    }

    const doc = listExternalDocumentsForBilling(ORG_ID, BILLING_ID)[0];
    expect(doc?.issuanceOutcome).toBe('confirmed_rejected');
    expect(doc?.lastErrorMessage).toBe('SUMIT rejected create');
  });

  it('create returns DocumentID and getdetails fails => confirmed_created without retry', async () => {
    const provider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockSumitClient({ createDocumentId: '9001', getDetailsFails: true }),
    });
    setStatutoryInvoicingProviderForTests(provider);

    const created = await requestExternalStatutoryDocumentCommitted(USER_ID, ORG_ID, BILLING_ID);

    expect(created.issuanceOutcome).toBe('confirmed_created');
    expect(created.externalId).toBe('9001');
    expect(created.reconciliationStatus).toBe('not_available');

    const docs = listExternalDocumentsForBilling(ORG_ID, BILLING_ID);
    expect(() => assertIssuanceEligible(docs)).toThrow(DomainRuleError);
  });

  it('ambiguous remains blocking', async () => {
    class ThrowingProvider extends ScriptedStatutoryProvider {
      override async createDocument(): Promise<StatutoryProviderResult<CreateExternalDocumentOutput>> {
        throw new Error('network reset');
      }
    }

    setStatutoryInvoicingProviderForTests(new ThrowingProvider());

    await expect(
      requestExternalStatutoryDocumentCommitted(USER_ID, ORG_ID, BILLING_ID),
    ).rejects.toThrow('network reset');

    const doc = listExternalDocumentsForBilling(ORG_ID, BILLING_ID)[0];
    expect(doc?.issuanceOutcome).toBe('ambiguous');
    expect(() => assertIssuanceEligible([doc!])).toThrow(DomainRuleError);
  });

  it('duplicate create blocked after confirmed_created', async () => {
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());

    const created = await requestExternalStatutoryDocument(contextWithManage(), {
      billing: bridge(),
      kind: 'tax_invoice',
      idempotencyKey: buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice'),
    });

    expect(created.issuanceOutcome).toBe('confirmed_created');

    await expect(
      requestExternalStatutoryDocument(contextWithManage(), {
        billing: bridge({ externalReference: 'pf:other' }),
        kind: 'tax_invoice',
        idempotencyKey: 'pf:other:tax_invoice:v1',
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(findExternalDocumentById(ORG_ID, created.id)?.externalId).toBeTruthy();
  });

  it('matched reconciliation when getdetails succeeds', async () => {
    const provider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'test-key' },
      httpClient: mockSumitClient({ createDocumentId: '9002' }),
    });
    setStatutoryInvoicingProviderForTests(provider);

    const created = await requestExternalStatutoryDocumentCommitted(USER_ID, ORG_ID, BILLING_ID);
    expect(created.reconciliationStatus).toBe('matched');
    expect(created.externalId).toBe('9002');
  });
});
