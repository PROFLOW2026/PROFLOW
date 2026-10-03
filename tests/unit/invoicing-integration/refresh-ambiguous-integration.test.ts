import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ScriptedStatutoryProvider,
  refreshExternalStatutoryStatus,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  updateExternalDocument,
  type BillingRecordBridgeRef,
} from '@/modules/invoicing-integration';
import { resolveStatutoryPdfBytes } from '@/modules/invoicing-integration/application/resolve-statutory-pdf';
import {
  enableExternalProviderSettingsForTests,
  resetOrgInvoicingSettingsForTests,
} from './test-external-provider-settings';

const ORG_ID = '01900000-0000-7000-8000-0000000000cc';
const BILLING_ID = '01900000-0000-7000-8000-0000000000dd';

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

function finalizedBilling(overrides: Partial<BillingRecordBridgeRef> = {}): BillingRecordBridgeRef {
  return {
    billingRecordId: BILLING_ID,
    organizationId: ORG_ID,
    projectId: '01900000-0000-7000-8000-0000000000ee',
    clientId: null,
    kind: 'invoice',
    status: 'finalized',
    reference: 'BR-100',
    subtotalAmount: { amount: '100.000000', currency: 'ILS' },
    taxAmount: { amount: '17.000000', currency: 'ILS' },
    totalAmount: { amount: '117.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    vatRatePercent: 17,
    lines: [
      {
        description: 'Services',
        lineNet: { amount: '100.000000', currency: 'ILS' },
        quantity: '1',
        unitPrice: '100.000000',
      },
    ],
    issuer: null,
    customer: null,
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    notes: null,
    externalReference: 'idem-ambiguous-recovery',
    ...overrides,
  };
}

describe('refreshExternalStatutoryStatus ambiguous recovery (L3)', () => {
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

  it('ambiguous → refresh → confirmed_created → PDF resolver accepts', async () => {
    const created = await requestExternalStatutoryDocument(ctx(), {
      billing: finalizedBilling(),
      kind: 'tax_invoice',
      idempotencyKey: 'idem-ambiguous-recovery',
    });
    expect(created.externalId).toBeTruthy();

    await updateExternalDocument(ctx(), created.id, {
      issuanceOutcome: 'ambiguous',
      status: 'pending',
    });

    const refreshed = await refreshExternalStatutoryStatus(ctx(), {
      externalDocumentId: created.id,
    });

    expect(refreshed.issuanceOutcome).toBe('confirmed_created');
    try {
      await resolveStatutoryPdfBytes(ctx(), created.id);
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).message).not.toBe('Statutory document is not issued');
    }
  });

  it('ambiguous without external id cannot refresh', async () => {
    const created = await requestExternalStatutoryDocument(ctx(), {
      billing: finalizedBilling({ externalReference: 'idem-no-ext-id' }),
      kind: 'tax_invoice',
      idempotencyKey: 'idem-no-ext-id',
    });

    await updateExternalDocument(ctx(), created.id, {
      issuanceOutcome: 'ambiguous',
      externalId: null,
    });

    await expect(
      refreshExternalStatutoryStatus(ctx(), { externalDocumentId: created.id }),
    ).rejects.toThrow();
  });
});
