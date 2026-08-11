import { describe, expect, it } from 'vitest';
import { matchVendors } from '@/modules/ocr';

const vendors = [
  { id: 'v-exact', name: 'Alpha Supplies', identifiers: ['512345678'] },
  { id: 'v-name', name: 'Beta Hardware', identifiers: [] },
  { id: 'v-prob', name: 'Beta Hardware Ltd', identifiers: [] },
];

describe('vendor matching', () => {
  it('prefers exact trusted company number over name', () => {
    const hits = matchVendors({
      vendorName: 'Wrong Name',
      companyNumber: '512345678',
      vatId: null,
      vendors,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.strength).toBe('exact_identifier');
    expect(hits[0]?.vendorId).toBe('v-exact');
  });

  it('matches exact normalized vendor name', () => {
    const hits = matchVendors({
      vendorName: 'beta hardware',
      companyNumber: null,
      vatId: null,
      vendors,
    });
    expect(hits[0]?.strength).toBe('exact_name');
    expect(hits[0]?.vendorId).toBe('v-name');
  });

  it('returns probable candidates without merging', () => {
    const hits = matchVendors({
      vendorName: 'Beta',
      companyNumber: null,
      vatId: null,
      vendors,
    });
    expect(hits.every((hit) => hit.strength === 'probable_name')).toBe(true);
    expect(hits.map((hit) => hit.vendorId)).toEqual(expect.arrayContaining(['v-name', 'v-prob']));
  });

  it('returns no match when nothing is close', () => {
    expect(
      matchVendors({
        vendorName: 'Completely Different',
        companyNumber: '111111111',
        vatId: null,
        vendors,
      }),
    ).toEqual([]);
  });
});
