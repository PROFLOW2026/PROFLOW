import { describe, expect, it } from 'vitest';
import {
  currentAmountFromClaimQuantity,
  currentAmountFromProgressPercent,
} from '@/modules/subcontract-claims/domain/claim-line-draft-math';

describe('claim-line-draft-math', () => {
  const currency = 'ILS';

  it('derives this period from cumulative progress percent', () => {
    expect(
      currentAmountFromProgressPercent({
        revisedNet: '1000.00',
        priorCertified: '200.00',
        progressPercent: '50',
        currency,
      }),
    ).toBe('300.000000');
  });

  it('returns zero for invalid percent', () => {
    expect(
      currentAmountFromProgressPercent({
        revisedNet: '1000.00',
        priorCertified: '0',
        progressPercent: '-5',
        currency,
      }),
    ).toBe('0.000000');
  });

  it('derives this period from cumulative quantity', () => {
    expect(
      currentAmountFromClaimQuantity({
        revisedNet: '1000.00',
        contractQuantity: '100',
        priorCertified: '100.00',
        claimQuantity: '50',
        currency,
      }),
    ).toBe('400.000000');
  });

  it('returns zero when contract quantity is invalid', () => {
    expect(
      currentAmountFromClaimQuantity({
        revisedNet: '1000.00',
        contractQuantity: '0',
        priorCertified: '0',
        claimQuantity: '10',
        currency,
      }),
    ).toBe('0.000000');
  });
});
