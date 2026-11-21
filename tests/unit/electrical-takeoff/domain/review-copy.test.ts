import { describe, expect, it } from 'vitest';
import {
  boqLineIdentityStatus,
  canSaveReviewIdentity,
  detectionIdentityStatus,
  hasConfirmableLegendName,
  reviewPlainKey,
} from '@/modules/electrical-takeoff/domain/review-copy';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';

function detection(partial: Partial<EffectiveDetection> & Pick<EffectiveDetection, 'id'>): EffectiveDetection {
  return {
    sheetKey: 's',
    x: 10,
    y: 10,
    w: 12,
    h: 12,
    typeKey: null,
    origin: 'auto',
    status: 'suggested',
    confidence: 'high',
    reasons: [],
    rawClass: 'contact',
    tagText: null,
    signature: 'block:contact',
    source: 'dwg',
    areaId: null,
    needsReview: false,
    ...partial,
  };
}

describe('review-copy identity statuses', () => {
  it('treats an unambiguous legend name without a catalog type as automatically identified', () => {
    expect(
      detectionIdentityStatus(
        detection({
          id: 'electrolyte-1',
          identitySource: 'legend',
          originalText: 'תוצרת אלקטרולייט שקע יחיד',
          legendUnambiguous: true,
          needsReview: false,
        }),
      ),
    ).toBe('autoIdentified');
    expect(
      boqLineIdentityStatus({
        verified: false,
        identitySource: 'legend',
        typeKey: null,
        originalLabel: 'תוצרת אלקטרולייט שקע יחיד',
        breakdown: { unclassified: 0, low: 0, medium: 0, userConfirmed: 0 },
        suppressVerified: false,
      }),
    ).toBe('autoIdentified');
  });

  it('keeps a conflicting legend row in needs-check', () => {
    const row = detection({
      id: '36e-1',
      rawClass: '36e',
      signature: 'block:36e',
      identitySource: 'legend',
      originalText: 'מפסק מאור',
      legendUnambiguous: false,
      needsReview: true,
      reasons: ['type_ambiguous'],
      legendRowIds: ['L1', 'L2'],
    });
    expect(detectionIdentityStatus(row)).toBe('needsCheck');
    expect(reviewPlainKey(row)).toBe('legendConflict');
  });

  it('flags a cable legend description for review instead of treating it as identified', () => {
    const row = detection({
      id: 'n2xy-1',
      originalText: '(4x150) N2XY+70CU',
      legendUnambiguous: false,
      identitySource: 'uncertain',
      needsReview: true,
      reasons: ['unclassified', 'legend_unmapped'],
    });
    expect(detectionIdentityStatus(row)).toBe('needsCheck');
    expect(reviewPlainKey(row)).toBe('looksLikeLinear');
  });

  it('flags earthing weld work for review instead of treating it as an identified accessory', () => {
    const row = detection({
      id: 'wp-1',
      originalText: 'נקודת ריתוך בין 2 מוליכי טבעת הארקת יסוד',
      legendUnambiguous: false,
      identitySource: 'uncertain',
      needsReview: true,
      reasons: ['unclassified', 'legend_unmapped'],
    });
    expect(detectionIdentityStatus(row)).toBe('needsCheck');
    expect(reviewPlainKey(row)).toBe('looksLikeSiteWork');
  });

  it('marks a symbol with no legend row as unclassified or unmapped', () => {
    const row = detection({
      id: 'orphan-1',
      needsReview: true,
      reasons: ['legend_unmapped', 'unclassified'],
    });
    expect(detectionIdentityStatus(row)).toBe('unclassified');
    expect(reviewPlainKey(row)).toBe('legendUnmapped');
  });

  it('treats a confirmed match as manually approved even without a catalog type', () => {
    expect(
      detectionIdentityStatus(
        detection({
          id: 'ok-1',
          status: 'confirmed',
          identitySource: 'legend',
          originalText: 'שקע יחיד',
          legendUnambiguous: true,
        }),
      ),
    ).toBe('manuallyApproved');
  });

  it('allows save-and-confirm from an unambiguous legend name without a catalog type', () => {
    const row = detection({
      id: 'light-1',
      originalText: 'נקודת מאור',
      legendUnambiguous: true,
      identitySource: 'legend',
      reasons: [],
    });
    expect(hasConfirmableLegendName(row)).toBe(true);
    expect(canSaveReviewIdentity(null, row)).toBe(true);
  });

  it('blocks save-and-confirm when there is no legend name and no catalog type', () => {
    const row = detection({
      id: 'empty-1',
      reasons: ['unclassified', 'legend_unmapped'],
    });
    expect(canSaveReviewIdentity(null, row)).toBe(false);
    expect(canSaveReviewIdentity('light.point', row)).toBe(true);
  });

  it('does not treat a legend conflict as a confirmable name', () => {
    const row = detection({
      id: 'conflict-1',
      originalText: 'מפסק מאור',
      identitySource: 'legend',
      legendUnambiguous: false,
      reasons: ['type_ambiguous'],
      legendRowIds: ['a', 'b'],
    });
    expect(hasConfirmableLegendName(row)).toBe(false);
    expect(canSaveReviewIdentity(null, row)).toBe(false);
  });
});
