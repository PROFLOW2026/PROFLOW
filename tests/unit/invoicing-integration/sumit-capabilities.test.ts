import { describe, expect, it } from 'vitest';
import { statutoryStatusCapabilities } from '@/modules/invoicing-integration/application/provider-status';
import { FULL_ADAPTER_CAPABILITIES } from '@/modules/invoicing-integration/domain/types';
import type { SumitHttpClient } from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
import { SumitStatutoryProvider, sumitProviderCapabilities } from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';

const unusedClient: SumitHttpClient = {
  createDocument: async () => {
    throw new Error('not used');
  },
  getDocumentDetails: async () => {
    throw new Error('not used');
  },
  getDocumentPdf: async () => {
    throw new Error('not used');
  },
  listExpenseDocuments: async () => [],
  sendDocument: async () => undefined,
  ping: async () => true,
  testConnection: async () => ({ ok: true }),
};

describe('SUMIT statutory capabilities', () => {
  it('reports create and retrieve only, never the full adapter', () => {
    const capabilities = sumitProviderCapabilities();
    expect(capabilities).toEqual({
      createDocument: true,
      retrieveStatus: true,
      creditDocument: false,
      cancelDocument: false,
      allocateReference: false,
    });
    expect(capabilities).not.toEqual(FULL_ADAPTER_CAPABILITIES);
  });

  it('does not upgrade a connected SUMIT provider to full credit/cancel/allocate', () => {
    const provider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'key' },
      httpClient: unusedClient,
    });

    expect(provider.capabilities()).toEqual(sumitProviderCapabilities());
    expect(
      statutoryStatusCapabilities(true, provider.capabilities()),
    ).toEqual(sumitProviderCapabilities());
    expect(statutoryStatusCapabilities(false, provider.capabilities()).createDocument).toBe(false);
  });

  it('returns unsupported for credit, cancel, and allocate', async () => {
    const provider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'key' },
      httpClient: unusedClient,
    });

    const credit = await provider.creditDocument({
      organizationId: 'org',
      externalId: '1',
      reason: null,
      idempotencyKey: 'credit-1',
    });
    const cancel = await provider.cancelDocument({
      organizationId: 'org',
      externalId: '1',
      reason: null,
      idempotencyKey: 'cancel-1',
    });
    const allocate = await provider.allocateReference({
      organizationId: 'org',
      externalId: '1',
      allocationReference: 'ref',
      billingRecordId: 'billing-1',
    });

    expect(credit.ok).toBe(false);
    expect(cancel.ok).toBe(false);
    expect(allocate.ok).toBe(false);
    if (!credit.ok) expect(credit.errorCode).toBe('unsupported');
    if (!cancel.ok) expect(cancel.errorCode).toBe('unsupported');
    if (!allocate.ok) expect(allocate.errorCode).toBe('unsupported');
  });
});
