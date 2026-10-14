import { describe, expect, it } from 'vitest';
import {
  installmentRecognitionEntry,
  projectInstallmentContributionAmount,
} from '@/modules/financials/domain/installment-project-contribution';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

describe('F01 — installment project contribution (OD-03)', () => {
  it('9×10,000 NET with zero verified payments contributes 0 to project Actual', () => {
    const amount = projectInstallmentContributionAmount({
      fullAmount: '90000.000000',
      currency: ILS,
      installmentCount: 9,
      parentNet: '90000.000000',
      recognition: installmentRecognitionEntry(zeroMoney(ILS)),
    });
    expect(amount).toBe('0.000000');
  });

  it('after first payment recognized 10,000 NET, expense row contributes 10,000', () => {
    const amount = projectInstallmentContributionAmount({
      fullAmount: '90000.000000',
      currency: ILS,
      installmentCount: 9,
      parentNet: '90000.000000',
      recognition: installmentRecognitionEntry(money('10000', ILS)),
    });
    expect(amount).toBe('10000.000000');
  });

  it('single-payment expense still uses full NET (unchanged)', () => {
    const amount = projectInstallmentContributionAmount({
      fullAmount: '5000.000000',
      currency: ILS,
      installmentCount: 1,
      parentNet: '5000.000000',
      recognition: undefined,
    });
    expect(amount).toBe('5000.000000');
  });
});
