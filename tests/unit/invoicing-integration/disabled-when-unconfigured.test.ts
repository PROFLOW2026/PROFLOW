import { beforeEach, describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import {
  UnconfiguredStatutoryProvider,
  allocateExternalStatutoryReference,
  cancelExternalStatutoryDocument,
  creditExternalStatutoryDocument,
  getStatutoryInvoicingProvider,
  getStatutoryProviderStatus,
  isStatutoryInvoicingFeatureEnabled,
  refreshExternalStatutoryStatus,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  setStatutoryInvoicingProviderForTests,
  type BillingRecordBridgeRef,
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

function finalizedBilling(): BillingRecordBridgeRef {
  return {
    billingRecordId: BILLING_ID,
    organizationId: ORG_ID,
    projectId: null,
    clientId: null,
    kind: 'invoice',
    status: 'finalized',
    reference: 'BR-1',
    totalAmount: { amount: '100.000000', currency: 'ILS' },
    issueDate: '2026-08-01',
    dueDate: null,
    notes: null,
  };
}

describe('statutory invoicing disabled when unconfigured', () => {
  beforeEach(() => {
    resetExternalDocumentsStoreForTests();
    setStatutoryInvoicingProviderForTests(null);
  });

  it('defaults to unconfigured provider with feature off', () => {
    const provider = getStatutoryInvoicingProvider();
    expect(provider).toBeInstanceOf(UnconfiguredStatutoryProvider);
    expect(provider.isConfigured()).toBe(false);
    expect(provider.isFeatureEnabled()).toBe(false);
    expect(isStatutoryInvoicingFeatureEnabled()).toBe(false);
  });

  it('status copy key is connection-required', () => {
    const status = getStatutoryProviderStatus(contextWith([PERMISSIONS.BILLING_READ]));
    expect(status.configured).toBe(false);
    expect(status.featureEnabled).toBe(false);
    expect(status.messageKey).toBe('invoicingIntegration.status.connectionRequired');
    expect(status.capabilities).toEqual({
      createDocument: false,
      retrieveStatus: false,
      creditDocument: false,
      cancelDocument: false,
      allocateReference: false,
    });
  });

  it('provider methods return not_configured without inventing documents', async () => {
    const provider = new UnconfiguredStatutoryProvider();
    const create = await provider.createDocument({
      organizationId: ORG_ID,
      billing: finalizedBilling(),
      kind: 'tax_invoice',
      idempotencyKey: 'x'.repeat(8),
    });
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.errorCode).toBe('not_configured');

    const status = await provider.retrieveStatus({
      organizationId: ORG_ID,
      externalId: 'any',
    });
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.errorCode).toBe('not_configured');
  });

  it('application services refuse create / refresh / credit / cancel / allocate', async () => {
    const ctx = contextWith([PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE]);
    const provider = new UnconfiguredStatutoryProvider();

    await expect(
      requestExternalStatutoryDocument(
        ctx,
        {
          billing: finalizedBilling(),
          kind: 'tax_invoice',
          idempotencyKey: 'idem-unconf-1',
        },
        provider,
      ),
    ).rejects.toMatchObject({
      messageKey: 'invoicingIntegration.errors.connectionRequired',
    });

    await expect(
      refreshExternalStatutoryStatus(
        ctx,
        { externalDocumentId: '01900000-0000-7000-8000-0000000000ee' },
        provider,
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);

    await expect(
      creditExternalStatutoryDocument(
        ctx,
        {
          externalDocumentId: '01900000-0000-7000-8000-0000000000ee',
          idempotencyKey: 'idem-unconf-credit',
        },
        provider,
      ),
    ).rejects.toMatchObject({
      messageKey: 'invoicingIntegration.errors.connectionRequired',
    });

    await expect(
      cancelExternalStatutoryDocument(
        ctx,
        {
          externalDocumentId: '01900000-0000-7000-8000-0000000000ee',
          idempotencyKey: 'idem-unconf-cancel',
        },
        provider,
      ),
    ).rejects.toMatchObject({
      messageKey: 'invoicingIntegration.errors.connectionRequired',
    });

    await expect(
      allocateExternalStatutoryReference(
        ctx,
        {
          externalDocumentId: '01900000-0000-7000-8000-0000000000ee',
          allocationReference: 'PAY-1',
        },
        provider,
      ),
    ).rejects.toMatchObject({
      messageKey: 'invoicingIntegration.errors.connectionRequired',
    });
  });
});
