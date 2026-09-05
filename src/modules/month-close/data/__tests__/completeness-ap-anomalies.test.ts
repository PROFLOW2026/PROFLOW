import { describe, expect, it } from 'vitest';
import { isApBillAnomalyForCompleteness } from '@/modules/month-close/domain/completeness-ap-signals';

describe('month-close completeness — AP anomalies', () => {
  it('does not treat partially_matched status as an anomaly by itself', () => {
    expect(
      isApBillAnomalyForCompleteness({
        status: 'partially_matched',
        totalAmount: '1170',
        lineSum: 1170,
        netAmount: '1000',
        allocationSum: 1000,
      }),
    ).toBe(false);
  });

  it('flags a bill when total_amount differs from the line sum', () => {
    expect(
      isApBillAnomalyForCompleteness({
        status: 'open',
        totalAmount: '1170',
        lineSum: 1000,
        netAmount: '1000',
        allocationSum: 1000,
      }),
    ).toBe(true);
  });
});
