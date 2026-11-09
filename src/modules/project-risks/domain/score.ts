/** Risk exposure score (probability × impact), both on a 1–5 scale. */
export function projectRiskScore(probability: number, impact: number): number {
  return probability * impact;
}
