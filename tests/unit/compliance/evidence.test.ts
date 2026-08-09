import { describe, expect, it } from 'vitest';
import {
  hasDocumentEvidence,
  isMissingEvidence,
  resolveComplianceUiBucket,
} from '@/modules/compliance/domain/evidence';

describe('compliance evidence / missing UI', () => {
  it('treats absent documentId as missing evidence', () => {
    expect(hasDocumentEvidence({ documentId: null })).toBe(false);
    expect(
      isMissingEvidence({ documentId: null, status: 'valid' }),
    ).toBe(true);
    expect(
      isMissingEvidence({
        documentId: '11111111-1111-1111-1111-111111111111',
        status: 'valid',
      }),
    ).toBe(false);
  });

  it('does not flag revoked artifacts as missing', () => {
    expect(
      isMissingEvidence({ documentId: null, status: 'revoked' }),
    ).toBe(false);
  });

  it('maps primary UI buckets without inventing a DB status', () => {
    expect(
      resolveComplianceUiBucket({ documentId: null, status: 'valid' }),
    ).toBe('missing');
    expect(
      resolveComplianceUiBucket({
        documentId: '11111111-1111-1111-1111-111111111111',
        status: 'expiring_soon',
      }),
    ).toBe('expiring_soon');
    expect(
      resolveComplianceUiBucket({
        documentId: '11111111-1111-1111-1111-111111111111',
        status: 'expired',
      }),
    ).toBe('expired');
    expect(
      resolveComplianceUiBucket({
        documentId: '11111111-1111-1111-1111-111111111111',
        status: 'valid',
      }),
    ).toBe('valid');
  });
});
