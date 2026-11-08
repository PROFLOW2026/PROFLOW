import { describe, expect, it } from 'vitest';
import { paymentListScope } from '@/modules/subcontract-claims/application/support';

describe('paymentListScope', () => {
  it('keeps a named agreement and does not widen that vendor', () => {
    expect(
      paymentListScope([{ subcontractAgreementId: 'agr-1', vendorId: 'ven-1' }]),
    ).toEqual({ agreementIds: ['agr-1'], vendorIds: [] });
  });

  it('includes the vendor when the payment grant has no agreement', () => {
    expect(
      paymentListScope([{ subcontractAgreementId: null, vendorId: 'ven-1' }]),
    ).toEqual({ agreementIds: [], vendorIds: ['ven-1'] });
  });

  it('unions a named agreement with a different vendor-wide grant', () => {
    expect(
      paymentListScope([
        { subcontractAgreementId: 'agr-1', vendorId: 'ven-1' },
        { subcontractAgreementId: null, vendorId: 'ven-2' },
      ]),
    ).toEqual({ agreementIds: ['agr-1'], vendorIds: ['ven-2'] });
  });
});
