import { describe, expect, it } from 'vitest';
import { resolveVoidedBillCommitmentRestoreAmount } from '@/modules/ap/application/void-bill';

describe('void AP bill — PO commitment restore', () => {
  it('restores NET when net and gross both exist', () => {
    expect(
      resolveVoidedBillCommitmentRestoreAmount({
        netAmount: '1000',
        totalAmount: '1170',
      }),
    ).toBe('1000');
  });

  it('falls back to total when NET is null', () => {
    expect(
      resolveVoidedBillCommitmentRestoreAmount({
        netAmount: null,
        totalAmount: '1000',
      }),
    ).toBe('1000');
  });
});
