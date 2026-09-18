import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  enableExternalProviderSettingsForTests,
  resetOrgInvoicingSettingsForTests,
} from './test-external-provider-settings';
import {
  ScriptedStatutoryProvider,
  assertIssuanceEligible,
  buildStatutoryIdempotencyKey,
  createExternalDocumentRow,
  findBlockingExternalDocument,
  findReusableRejectedDocument,
  openInvoicingCredentials,
  reconcileExternalAmounts,
  requestExternalStatutoryDocument,
  resetExternalDocumentsStoreForTests,
  sealInvoicingCredentials,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
  type BillingRecordBridgeRef,
} from '@/modules/invoicing-integration';
import { money } from '@/shared/money';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

function contextWithManage(): OrgContext {
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
    permissions: new Set([PERMISSIONS.BILLING_MANAGE]),
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
    subtotalAmount: { amount: '100.000000', currency: 'ILS' },
    taxAmount: { amount: '17.000000', currency: 'ILS' },
    totalAmount: { amount: '117.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    vatRatePercent: 17,
    lines: [],
    issuer: null,
    customer: null,
    issueDate: '2026-08-01',
    dueDate: null,
    notes: null,
    externalReference: 'idem-1',
    ...overrides,
  };
}

describe('SUMIT Milestone A invariants', () => {
  beforeEach(() => {
    enableExternalProviderSettingsForTests();
    setInvoicingIntegrationPersistenceReadyForTests(false);
    resetExternalDocumentsStoreForTests();
    setStatutoryInvoicingProviderForTests(new ScriptedStatutoryProvider());
  });

  afterEach(() => {
    resetOrgInvoicingSettingsForTests();
    setInvoicingIntegrationPersistenceReadyForTests(null);
    setStatutoryInvoicingProviderForTests(null);
  });

  it('seals and opens invoicing credentials roundtrip', () => {
    const sealed = sealInvoicingCredentials({ companyId: 12345, apiKey: 'secret-key-value' });
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(openInvoicingCredentials(sealed)).toEqual({
      companyId: 12345,
      apiKey: 'secret-key-value',
    });
  });

  it('reconciles matched and mismatch amounts', () => {
    const billing = bridge();
    const matched = reconcileExternalAmounts(billing, {
      net: money('100.000000', 'ILS'),
      vat: money('17.000000', 'ILS'),
      gross: money('117.000000', 'ILS'),
    });
    expect(matched.status).toBe('matched');

    const mismatch = reconcileExternalAmounts(billing, {
      net: money('100.000000', 'ILS'),
      vat: money('17.000000', 'ILS'),
      gross: money('118.000000', 'ILS'),
    });
    expect(mismatch.status).toBe('mismatch');
  });

  it('blocks duplicate issuance when a blocking row exists', () => {
    const doc = createExternalDocumentRow({
      organizationId: ORG_ID,
      billingRecordId: BILLING_ID,
      providerId: 'scripted-test',
      kind: 'tax_invoice',
      status: 'pending',
      issuanceOutcome: 'ambiguous',
    });

    expect(findBlockingExternalDocument([doc])?.id).toBe(doc.id);
    expect(() => assertIssuanceEligible([doc])).toThrow(DomainRuleError);
    expect(findBlockingExternalDocument([])).toBeNull();
  });

  it('reopens the same row after confirmed_rejected + cancelled using canonical idempotency key', () => {
    const canonicalKey = buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice');
    const rejected = createExternalDocumentRow({
      organizationId: ORG_ID,
      billingRecordId: BILLING_ID,
      providerId: 'scripted-test',
      kind: 'tax_invoice',
      status: 'cancelled',
      issuanceOutcome: 'confirmed_rejected',
      idempotencyKey: canonicalKey,
    });

    expect(findReusableRejectedDocument([rejected])?.id).toBe(rejected.id);
    expect(findBlockingExternalDocument([rejected])).toBeNull();
    expect(() => assertIssuanceEligible([rejected])).not.toThrow();
  });

  it('rejects a second create for the same billing while confirmed_created exists', async () => {
    const ctx = contextWithManage();
    await requestExternalStatutoryDocument(ctx, {
      billing: bridge({ externalReference: 'idem-first' }),
      kind: 'tax_invoice',
      idempotencyKey: 'idem-first',
    });

    await expect(
      requestExternalStatutoryDocument(ctx, {
        billing: bridge({ externalReference: 'idem-second' }),
        kind: 'tax_invoice',
        idempotencyKey: 'idem-second',
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
