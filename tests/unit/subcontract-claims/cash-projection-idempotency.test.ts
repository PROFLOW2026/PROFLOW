import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import {
  buildCertifiedReceiptCashLines,
  claimCashProjectionIdempotencyKey,
  resolveExpectedReceiptTiming,
} from '@/modules/subcontract-claims/domain/certified-receipt-cash-flow';

describe('claim cash projection idempotency', () => {
  it('uses a stable key per mapping and payable basis', () => {
    const input = { mappingId: 'map-1', payableBasisId: 'basis-9' };
    const first = claimCashProjectionIdempotencyKey(input);
    const second = claimCashProjectionIdempotencyKey(input);
    expect(first).toBe('claim-cash:map-1:basis-9');
    expect(second).toBe(first);
    expect(claimCashProjectionIdempotencyKey({ ...input, payableBasisId: 'basis-10' })).not.toBe(first);
  });

  it('builds identical forecast lines on certification replay with the same facts', () => {
    const facts = {
      payableBasisId: 'basis-1',
      claimId: 'claim-1',
      claimNumber: 3,
      projectId: 'proj-1',
      agreementId: 'agr-1',
      agreementTitle: 'Concrete',
      sourceVersion: 2,
      payableNet: money('8000', 'ILS'),
      retentionAmount: money('800', 'ILS'),
      certificationDate: businessDate('2026-10-01'),
      paymentTermsDays: 30,
      apBillDueDate: null,
      scheduleDueDate: null,
    };

    const first = buildCertifiedReceiptCashLines(facts);
    const second = buildCertifiedReceiptCashLines(facts);
    expect(second).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ lineKey: 'payable', dueDate: '2026-10-31', certainty: 'expected' });
    expect(first[1]).toMatchObject({ lineKey: 'retention', dueDate: null, certainty: 'uncertain' });
  });

  it('prefers AP bill due date for timing so retries do not shift recorded certainty', () => {
    const timing = resolveExpectedReceiptTiming({
      apBillDueDate: businessDate('2026-11-15'),
      scheduleDueDate: businessDate('2026-11-01'),
      certificationDate: businessDate('2026-10-01'),
      paymentTermsDays: 7,
    });
    expect(timing).toEqual({ dueDate: '2026-11-15', recorded: true });
  });
});
