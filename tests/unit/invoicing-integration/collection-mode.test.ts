import { describe, expect, it } from 'vitest';
import {
  isAccountingInvoicingMode,
  isCollectionOnlyMode,
  resolveAccountingProviderDisplayName,
} from '@/modules/invoicing-integration/domain/collection-mode';
import { DEFAULT_ORG_INVOICING_SETTINGS } from '@/modules/invoicing-integration/domain/org-invoicing-settings';
import { resolvePaymentReceiptOutcome } from '@/modules/invoicing-integration/domain/payment-receipt-outcome';

describe('collection mode helpers', () => {
  it('treats manual statutory mode as collection-only', () => {
    expect(isCollectionOnlyMode(DEFAULT_ORG_INVOICING_SETTINGS)).toBe(true);
    expect(isAccountingInvoicingMode(DEFAULT_ORG_INVOICING_SETTINGS)).toBe(false);
  });

  it('treats external_provider as accounting invoicing mode', () => {
    const settings = {
      ...DEFAULT_ORG_INVOICING_SETTINGS,
      mode: 'external_provider' as const,
    };
    expect(isCollectionOnlyMode(settings)).toBe(false);
    expect(isAccountingInvoicingMode(settings)).toBe(true);
  });

  it('maps known provider ids to display names without hard-coding collection flows', () => {
    expect(resolveAccountingProviderDisplayName('sumit')).toBe('SUMIT');
    expect(resolveAccountingProviderDisplayName('unconfigured')).toBeNull();
  });
});

describe('payment receipt outcome', () => {
  const baseDoc = {
    id: 'doc-1',
    billingRecordId: 'bill-1',
    paymentId: 'pay-1',
    kind: 'receipt' as const,
    status: 'issued' as const,
    externalId: 'ext-1',
    externalNumber: '1000',
    issuanceOutcome: 'confirmed_created' as const,
  };

  it('returns none when no payment id is provided', () => {
    expect(resolvePaymentReceiptOutcome([baseDoc as never], null)).toBe('none');
  });

  it('returns issued when receipt doc exists for payment', () => {
    expect(resolvePaymentReceiptOutcome([baseDoc as never], 'pay-1')).toBe('issued');
  });

  it('returns failed without implying payment rollback', () => {
    expect(
      resolvePaymentReceiptOutcome(
        [
          {
            ...baseDoc,
            issuanceOutcome: 'confirmed_rejected' as const,
            status: 'failed' as const,
            externalId: null,
          } as never,
        ],
        'pay-1',
      ),
    ).toBe('failed');
  });
});
