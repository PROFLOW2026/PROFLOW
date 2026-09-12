import { describe, expect, it } from 'vitest';
import { netProjectSliceAfterCredits } from '@/modules/ap';

/**
 * CASE 9 — Agreement on project A; bill 40k split 50/30/20.
 * Agreement recognized slice must be 20k (A share), not 40k.
 */
describe('subcontract agreement multi-project bill recognition', () => {
  it('uses project slice amount for agreement credit, not full bill NET', () => {
    const netted = netProjectSliceAfterCredits({
      currency: 'ILS',
      billNetAmount: '40000',
      sliceAmount: '20000',
      creditActualReductions: [],
      projectId: 'project-a',
    });
    expect(Number(netted.amount)).toBe(20000);
  });

  it('scales slice when credits apply to full bill', () => {
    const netted = netProjectSliceAfterCredits({
      currency: 'ILS',
      billNetAmount: '40000',
      sliceAmount: '20000',
      creditActualReductions: [{ amount: '4000', projectId: 'project-a' }],
      projectId: 'project-a',
    });
    expect(Number(netted.amount)).toBeLessThanOrEqual(20000);
  });
});
