import { describe, expect, it } from 'vitest';
import { projectRiskScore } from '@/modules/project-risks/domain/score';

describe('projectRiskScore', () => {
  it('multiplies probability and impact', () => {
    expect(projectRiskScore(1, 1)).toBe(1);
    expect(projectRiskScore(3, 4)).toBe(12);
    expect(projectRiskScore(5, 5)).toBe(25);
  });
});
