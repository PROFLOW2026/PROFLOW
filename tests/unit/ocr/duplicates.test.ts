import { describe, expect, it } from 'vitest';
import { detectDuplicateHits, shouldReuseExistingJob } from '@/modules/ocr';

describe('duplicate detection', () => {
  it('flags an exact file checksum as exact_file', () => {
    const hits = detectDuplicateHits(
      { checksumSha256: 'abc', documentId: 'doc-2', jobId: 'job-2' },
      [{ kind: 'document', id: 'doc-1', checksumSha256: 'abc', documentId: 'doc-1' }],
    );
    expect(hits[0]?.kind).toBe('exact_file');
    expect(hits[0]?.reasonKeys).toContain('checksum');
  });

  it('flags probable business duplicates from vendor + reference', () => {
    const hits = detectDuplicateHits(
      {
        vendorName: 'Alpha',
        reference: 'INV-1',
        date: '2026-08-01',
        amount: '117.00',
        currency: 'ILS',
        jobId: 'job-new',
      },
      [
        {
          kind: 'vendor_bill',
          id: 'bill-1',
          vendorName: 'Alpha',
          reference: 'INV-1',
          date: '2026-08-01',
          amount: '117',
          currency: 'ils',
        },
      ],
    );
    expect(hits[0]?.kind).toBe('probable_document');
    expect(hits[0]?.reasonKeys).toEqual(expect.arrayContaining(['vendorName', 'reference']));
  });

  it('does not treat a single overlapping field as a duplicate', () => {
    const hits = detectDuplicateHits(
      { vendorName: 'Alpha', amount: '10', currency: 'ILS', jobId: 'j' },
      [{ kind: 'expense', id: 'e1', vendorName: 'Alpha', amount: '99', currency: 'ILS' }],
    );
    expect(hits).toEqual([]);
  });

  it('reuses in-flight and completed jobs but not failed ones', () => {
    expect(shouldReuseExistingJob('needs_review')).toBe(true);
    expect(shouldReuseExistingJob('succeeded')).toBe(true);
    expect(shouldReuseExistingJob('failed')).toBe(false);
    expect(shouldReuseExistingJob('rejected')).toBe(false);
  });
});
