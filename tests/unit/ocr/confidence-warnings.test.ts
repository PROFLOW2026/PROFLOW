import { describe, expect, it } from 'vitest';
import {
  buildFixtureCandidates,
  collectReviewWarnings,
  confidenceState,
  lineItemsTrustworthy,
} from '@/modules/ocr';

describe('confidence states', () => {
  it('classifies high / needs checking / not detected without exposing provider jargon', () => {
    const provenance = { source: 'ocr' as const };
    expect(confidenceState({ value: 'Acme', confidence: 0.91, provenance })).toBe('high');
    expect(confidenceState({ value: 'Acme', confidence: 0.4, provenance })).toBe('uncertain');
    expect(confidenceState({ value: null, confidence: 0.99, provenance })).toBe('not_detected');
  });
});

describe('totals warnings', () => {
  it('warns when net + VAT does not equal gross without repairing amounts', () => {
    const candidates = buildFixtureCandidates({ net: '100.00', tax: '10.00', gross: '200.00' });
    const warnings = collectReviewWarnings(candidates, {
      vendorResolved: true,
      draftTarget: 'expense',
    });
    expect(warnings.some((warning) => warning.code === 'totals_mismatch')).toBe(true);
    expect(candidates.net.value).toBe('100.00');
    expect(candidates.gross.value).toBe('200.00');
  });

  it('warns when AP vendor is unresolved', () => {
    const warnings = collectReviewWarnings(buildFixtureCandidates(), {
      vendorResolved: false,
      draftTarget: 'vendor_bill',
    });
    expect(warnings.some((warning) => warning.code === 'vendor_unresolved')).toBe(true);
  });

  it('treats described lines as trustworthy for AP mapping', () => {
    expect(lineItemsTrustworthy(buildFixtureCandidates())).toBe(true);
    const blank = buildFixtureCandidates();
    expect(lineItemsTrustworthy({ ...blank, lines: [] })).toBe(false);
  });
});
