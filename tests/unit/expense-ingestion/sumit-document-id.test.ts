import { describe, expect, it } from 'vitest';
import { resolveSumitDocumentIdForOcrJob } from '@/modules/expense-ingestion/domain/types';

describe('SUMIT document id for a later OCR run', () => {
  it('prefers an explicit id, then stored metadata, then the idempotency key', () => {
    expect(
      resolveSumitDocumentIdForOcrJob({
        sumitDocumentId: '11',
        externalDocumentId: '22',
        idempotencyKey: 'sumit:33',
      }),
    ).toBe('11');
    expect(
      resolveSumitDocumentIdForOcrJob({
        externalDocumentId: '22',
        idempotencyKey: 'sumit:33',
      }),
    ).toBe('22');
    expect(resolveSumitDocumentIdForOcrJob({ idempotencyKey: 'sumit:33' })).toBe('33');
    expect(resolveSumitDocumentIdForOcrJob({ idempotencyKey: 'other' })).toBeNull();
  });
});
