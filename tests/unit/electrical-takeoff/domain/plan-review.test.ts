import { describe, expect, it } from 'vitest';

import { planReviewConfirmed } from '@/modules/electrical-takeoff/domain/plan-review';
import type { TakeoffEdit } from '@/modules/electrical-takeoff/domain/contracts';

describe('planReviewConfirmed', () => {
  it('stays false until the user confirms, and a later quantity edit clears it', () => {
    const edits: TakeoffEdit[] = [
      { op: 'delete', detectionId: 'p1#1' },
      { op: 'confirm_plan_review', confirmed: true },
      { op: 'set_note', detectionId: 'p1#2', tagText: 'X2' },
    ];
    expect(planReviewConfirmed([])).toBe(false);
    expect(planReviewConfirmed(edits.slice(0, 1))).toBe(false);
    expect(planReviewConfirmed(edits.slice(0, 2))).toBe(true);
    expect(planReviewConfirmed(edits)).toBe(false);
    expect(planReviewConfirmed([...edits, { op: 'confirm_plan_review', confirmed: true }])).toBe(true);
  });
});
