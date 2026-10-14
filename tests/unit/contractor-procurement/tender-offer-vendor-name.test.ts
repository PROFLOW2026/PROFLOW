import { describe, expect, it } from 'vitest';
import { tenderOfferVendorLabel } from '@/modules/contractor-procurement/domain/tender-offer-display';

describe('tender offer vendor label', () => {
  it('shows vendor name and never a truncated uuid fallback', () => {
    const names = new Map([['11111111-1111-4111-8111-111111111111', 'Volt Electric']]);
    expect(tenderOfferVendorLabel(names, '11111111-1111-4111-8111-111111111111')).toBe('Volt Electric');
    expect(tenderOfferVendorLabel(names, '22222222-2222-4222-8222-222222222222', 'Unknown')).toBe(
      'Unknown',
    );
    expect(
      tenderOfferVendorLabel(names, '22222222-2222-4222-8222-222222222222', 'Unknown'),
    ).not.toMatch(/22222222/);
  });
});
