import { describe, expect, it } from 'vitest';
import { effectiveCertifiedByLine } from '@/modules/subcontract-claims/domain/assessments';
import type { AssessmentFact } from '@/modules/subcontract-claims/domain/assessments';

describe('append-only assessment history (effective certified)', () => {
  it('preserves submitted 80, certified 60, reassessed 70 — latest line decision wins', () => {
    const lineId = '11111111-1111-4111-8111-111111111111';
    const facts: AssessmentFact[] = [
      { seq: 1, claimLineId: lineId, decision: 'certify', certifiedAmount: '60' },
      { seq: 2, claimLineId: lineId, decision: 'reassess', certifiedAmount: '70' },
    ];
    const effective = effectiveCertifiedByLine(facts, 'ILS');
    expect(effective.get(lineId)?.amount).toBe('70.000000');
    expect(facts).toHaveLength(2);
  });

  it('ignores non-certifying decisions when computing effective amounts', () => {
    const lineId = '22222222-2222-4222-8222-222222222222';
    const facts: AssessmentFact[] = [
      { seq: 1, claimLineId: null, decision: 'return', certifiedAmount: null },
      { seq: 2, claimLineId: lineId, decision: 'certify', certifiedAmount: '80' },
      { seq: 3, claimLineId: lineId, decision: 'request_evidence', certifiedAmount: null },
      { seq: 4, claimLineId: lineId, decision: 'reassess', certifiedAmount: '75' },
    ];
    expect(effectiveCertifiedByLine(facts, 'ILS').get(lineId)?.amount).toBe('75.000000');
  });
});
