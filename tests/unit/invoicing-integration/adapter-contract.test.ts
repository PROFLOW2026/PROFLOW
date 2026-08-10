import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import {
  ScriptedStatutoryProvider,
  UnconfiguredStatutoryProvider,
  allocateExternalStatutoryReference,
  cancelExternalStatutoryDocument,
  creditExternalStatutoryDocument,
  getStatutoryProviderStatus,
  isStatutoryInvoicingFeatureEnabled,
  refreshExternalStatutoryStatus,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  type BillingRecordBridgeRef,
  type StatutoryInvoicingProvider,
} from '@/modules/invoicing-integration';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
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
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function finalizedBilling(overrides: Partial<BillingRecordBridgeRef> = {}): BillingRecordBridgeRef {
  return {
    billingRecordId: BILLING_ID,
    organizationId: ORG_ID,
    projectId: '01900000-0000-7000-8000-0000000000cc',
    clientId: null,
    kind: 'invoice',
    status: 'finalized',
    reference: 'BR-100',
    totalAmount: { amount: '117.000000', currency: 'ILS' },
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    notes: null,
    ...overrides,
  };
}

function assertAdapterSurface(provider: StatutoryInvoicingProvider): void {
  expect(typeof provider.id).toBe('string');
  expect(typeof provider.isConfigured).toBe('function');
  expect(typeof provider.isFeatureEnabled).toBe('function');
  expect(typeof provider.createDocument).toBe('function');
  expect(typeof provider.retrieveStatus).toBe('function');
  expect(typeof provider.creditDocument).toBe('function');
  expect(typeof provider.cancelDocument).toBe('function');
  expect(typeof provider.allocateReference).toBe('function');
}

describe('StatutoryInvoicingProvider adapter contract', () => {
  beforeEach(() => {
    setInvoicingIntegrationPersistenceReadyForTests(false);
    resetExternalDocumentsStoreForTests();
    setStatutoryInvoicingProviderForTests(null);
  });

  afterEach(() => {
    setInvoicingIntegrationPersistenceReadyForTests(null);
  });

  it('exposes create / status / credit / cancel / allocate on providers', () => {
    assertAdapterSurface(new UnconfiguredStatutoryProvider());
    assertAdapterSurface(new ScriptedStatutoryProvider());
  });

  it('scripted provider creates, refreshes, allocates, credits, and cancels', async () => {
    const provider = new ScriptedStatutoryProvider();
    setStatutoryInvoicingProviderForTests(provider);
    const ctx = contextWith([PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE]);

    const created = await requestExternalStatutoryDocument(ctx, {
      billing: finalizedBilling(),
      kind: 'tax_invoice',
      idempotencyKey: 'idem-create-1',
    });
    expect(created.status).toBe('issued');
    expect(created.externalNumber).toMatch(/^EXT-TEST-/);
    expect(created.externalUrl).toContain('https://example.test/statutory/');
    expect(created.pdf?.contentType).toBe('application/pdf');
    expect(created.billingRecordId).toBe(BILLING_ID);

    const refreshed = await refreshExternalStatutoryStatus(ctx, {
      externalDocumentId: created.id,
    });
    expect(refreshed.status).toBe('issued');
    expect(refreshed.externalId).toBe(created.externalId);

    const allocated = await allocateExternalStatutoryReference(ctx, {
      externalDocumentId: created.id,
      allocationReference: 'PAY-55',
    });
    expect(allocated.allocationReference).toBe('PAY-55');
    expect(allocated.status).toBe('allocated');

    const { original, credit } = await creditExternalStatutoryDocument(ctx, {
      externalDocumentId: created.id,
      reason: 'partial return',
      idempotencyKey: 'idem-credit-1',
    });
    expect(original.status).toBe('credited');
    expect(credit.kind).toBe('credit_note');
    expect(credit.externalNumber).toMatch(/^EXT-CREDIT-/);

    const cancelledSource = await requestExternalStatutoryDocument(ctx, {
      billing: finalizedBilling({
        billingRecordId: '01900000-0000-7000-8000-0000000000dd',
      }),
      kind: 'tax_invoice',
      idempotencyKey: 'idem-create-2',
    });
    const cancelled = await cancelExternalStatutoryDocument(ctx, {
      externalDocumentId: cancelledSource.id,
      reason: 'void at provider',
      idempotencyKey: 'idem-cancel-1',
    });
    expect(cancelled.status).toBe('cancelled');
  });

  it('reports feature enabled only for configured scripted provider', () => {
    const ctx = contextWith([PERMISSIONS.BILLING_READ]);
    const unconfigured = new UnconfiguredStatutoryProvider();
    expect(isStatutoryInvoicingFeatureEnabled(unconfigured)).toBe(false);
    expect(getStatutoryProviderStatus(ctx, unconfigured).featureEnabled).toBe(false);
    expect(getStatutoryProviderStatus(ctx, unconfigured).messageKey).toBe(
      'invoicingIntegration.status.connectionRequired',
    );

    const scripted = new ScriptedStatutoryProvider();
    expect(isStatutoryInvoicingFeatureEnabled(scripted)).toBe(true);
    expect(getStatutoryProviderStatus(ctx, scripted).capabilities.createDocument).toBe(true);
  });

  it('rejects draft billing for external request even when provider is configured', async () => {
    const provider = new ScriptedStatutoryProvider();
    const ctx = contextWith([PERMISSIONS.BILLING_MANAGE]);
    await expect(
      requestExternalStatutoryDocument(
        ctx,
        {
          billing: finalizedBilling({ status: 'draft' }),
          kind: 'tax_invoice',
          idempotencyKey: 'idem-draft',
        },
        provider,
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
