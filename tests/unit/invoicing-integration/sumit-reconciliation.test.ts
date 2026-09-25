import { describe, expect, it } from 'vitest';
import { bridge } from './sumit-reconciliation.fixtures';
import { reconcileExternalAmounts } from '@/modules/invoicing-integration';
import { parseSumitDocumentAmounts } from '@/modules/invoicing-integration/providers/sumit/sumit-document-amounts';
import { SumitStatutoryProvider } from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';
import { money } from '@/shared/money';

const provider = new SumitStatutoryProvider({
  credentials: { companyId: 1, apiKey: 'test-key' },
});

function sumitGetDetailsPayload(input: {
  items: { totalPrice: number; vat?: number }[];
  companyValue?: number;
}) {
  return {
    Data: {
      DocumentID: 1001,
      DocumentNumber: 1001,
      Document: {
        CompanyValue: input.companyValue ?? null,
      },
      Items: input.items.map((item) => ({
        TotalPrice: item.totalPrice,
        VAT: item.vat ?? null,
      })),
    },
  };
}

describe('SUMIT reconciliation invariants', () => {
  it('A. matched when SUMIT actual NET/VAT/GROSS equal PF', () => {
    const billing = bridge();
    const parsed = parseSumitDocumentAmounts(
      sumitGetDetailsPayload({
        items: [
          { totalPrice: 100, vat: 17 },
        ],
        companyValue: 117,
      }),
    );
    const actuals = provider.mapProviderAmounts('ILS', parsed);
    expect(reconcileExternalAmounts(billing, actuals).status).toBe('matched');
  });

  it('B. mismatch when SUMIT NET differs', () => {
    const billing = bridge();
    const parsed = parseSumitDocumentAmounts(
      sumitGetDetailsPayload({
        items: [{ totalPrice: 99, vat: 17 }],
        companyValue: 116,
      }),
    );
    const actuals = provider.mapProviderAmounts('ILS', parsed);
    expect(reconcileExternalAmounts(billing, actuals).status).toBe('mismatch');
  });

  it('C. mismatch when SUMIT VAT differs', () => {
    const billing = bridge();
    const parsed = parseSumitDocumentAmounts(
      sumitGetDetailsPayload({
        items: [{ totalPrice: 100, vat: 16 }],
        companyValue: 116,
      }),
    );
    const actuals = provider.mapProviderAmounts('ILS', parsed);
    expect(reconcileExternalAmounts(billing, actuals).status).toBe('mismatch');
  });

  it('D. mismatch when SUMIT gross differs', () => {
    const billing = bridge();
    const parsed = parseSumitDocumentAmounts(
      sumitGetDetailsPayload({
        items: [{ totalPrice: 100, vat: 17 }],
        companyValue: 118,
      }),
    );
    const actuals = provider.mapProviderAmounts('ILS', parsed);
    expect(reconcileExternalAmounts(billing, actuals).status).toBe('mismatch');
  });

  it('E. not_available when SUMIT NET/VAT unavailable', () => {
    const billing = bridge();
    const parsed = parseSumitDocumentAmounts({
      Data: { DocumentID: 1, Document: { CompanyValue: 117 }, Items: [] },
    });
    expect(provider.mapProviderAmounts('ILS', parsed)).toBeNull();
    expect(reconcileExternalAmounts(billing, null).status).toBe('not_available');
  });

  it('F. never substitutes PF expected values as provider actuals', () => {
    const billing = bridge();
    const parsed = {
      netAmount: null,
      vatAmount: null,
      grossAmount: '117.000000',
    };
    const actuals = provider.mapProviderAmounts('ILS', parsed);
    expect(actuals).toBeNull();
    expect(reconcileExternalAmounts(billing, actuals).status).toBe('not_available');
    expect(reconcileExternalAmounts(billing, {
      net: money('100.000000', 'ILS'),
      vat: money('17.000000', 'ILS'),
      gross: money('117.000000', 'ILS'),
    }).metadata.actualNet).toBe('100.000000');
  });
});
