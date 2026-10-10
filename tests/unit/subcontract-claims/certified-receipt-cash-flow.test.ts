import { describe, expect, it } from 'vitest';
import {
  buildCertifiedReceiptCashLines,
  claimCashProjectionIdempotencyKey,
  resolveExpectedReceiptTiming,
} from '@/modules/subcontract-claims/domain/certified-receipt-cash-flow';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

describe('certified receipt cash flow', () => {
  it('uses AP bill due date as recorded timing before payment terms', () => {
    const timing = resolveExpectedReceiptTiming({
      apBillDueDate: businessDate('2026-09-01'),
      scheduleDueDate: null,
      certificationDate: businessDate('2026-08-01'),
      paymentTermsDays: 30,
    });
    expect(timing).toEqual({ dueDate: businessDate('2026-09-01'), recorded: true });
  });

  it('adds payment terms to certification when no bill due date', () => {
    const timing = resolveExpectedReceiptTiming({
      apBillDueDate: null,
      scheduleDueDate: null,
      certificationDate: businessDate('2026-08-01'),
      paymentTermsDays: 45,
    });
    expect(timing.dueDate).toBe(businessDate('2026-09-15'));
    expect(timing.recorded).toBe(false);
  });

  it('never invents a due date without terms or bill', () => {
    const timing = resolveExpectedReceiptTiming({
      apBillDueDate: null,
      scheduleDueDate: null,
      certificationDate: businessDate('2026-08-01'),
      paymentTermsDays: null,
    });
    expect(timing).toEqual({ dueDate: null, recorded: false });
  });

  it('splits payable NET and retention without double-counting submitted amounts', () => {
    const lines = buildCertifiedReceiptCashLines({
      payableBasisId: 'basis-1',
      claimId: 'claim-1',
      claimNumber: 3,
      projectId: 'proj',
      agreementId: 'agr',
      agreementTitle: 'Electrical',
      sourceVersion: 1,
      payableNet: money('85000', 'ILS'),
      retentionAmount: money('15000', 'ILS'),
      certificationDate: businessDate('2026-08-01'),
      paymentTermsDays: 30,
      apBillDueDate: null,
      scheduleDueDate: null,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ lineKey: 'payable', certainty: 'expected' });
    expect(lines[1]).toMatchObject({ lineKey: 'retention', dueDate: null, certainty: 'uncertain' });
  });

  it('builds stable idempotency keys for projection upserts', () => {
    expect(
      claimCashProjectionIdempotencyKey({ mappingId: 'map-1', payableBasisId: 'basis-9' }),
    ).toBe('claim-cash:map-1:basis-9');
  });
});
