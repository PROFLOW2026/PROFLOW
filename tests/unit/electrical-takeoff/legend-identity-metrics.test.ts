import { describe, expect, it } from 'vitest';

import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { measureLegendIdentity } from '@/modules/electrical-takeoff/domain/legend-identity';
import { isDetectionCountable } from '@/modules/electrical-takeoff/domain/counting-policy';
import { buildReviewGroups } from '@/modules/electrical-takeoff/ui/review-guide';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';

/** Catalog-only eval from docs/audits/takeoff-legend-classification-eval-2026-11-21.json. Not invented. */
const BEFORE_EVAL = {
  '3643': { geometric: 1702, autoClassified: 170, unclassified: 1532, detectionsWithLegendRowIds: 1150 },
  '1545': { geometric: 1394, autoClassified: 0, unclassified: 1394, detectionsWithLegendRowIds: 988 },
  '7155': { geometric: 415, autoClassified: 44, unclassified: 371, detectionsWithLegendRowIds: 275 },
} as const;

describe('legend identity coverage', () => {
  it('records the stored eval snapshot as the before baseline (catalog-only classification)', () => {
    expect(BEFORE_EVAL['3643'].geometric).toBe(1702);
    expect(BEFORE_EVAL['3643'].autoClassified + BEFORE_EVAL['3643'].unclassified).toBe(BEFORE_EVAL['3643'].geometric);
    expect(BEFORE_EVAL['1545'].detectionsWithLegendRowIds).toBe(988);
    expect(BEFORE_EVAL['7155'].autoClassified).toBe(44);
  });

  it('measures 7155 fixture before/after legend identity on the same worker JSON', () => {
    const { view, workerBase } = getReal7155Fixture();
    const beforeDetections = applyEdits(workerBase, []);
    const before = measureLegendIdentity(beforeDetections, isDetectionCountable, (rows) => buildReviewGroups(rows).length);
    const after = measureLegendIdentity(view.detections, isDetectionCountable, (rows) => buildReviewGroups(rows).length);
    expect(before.geometric).toBe(652);
    expect(after.geometric).toBe(387);
    expect(after.unambiguousLegend).toBeGreaterThanOrEqual(before.unambiguousLegend);
    expect(after.legendWithoutCatalog + after.catalogTyped + after.unidentified).toBe(after.geometric);
    expect(after.reviewGroups).toBeLessThanOrEqual(before.reviewGroups);
    expect(after.unambiguousLegend).toBe(1);
  });
});
