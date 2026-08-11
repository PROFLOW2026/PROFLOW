import type { OcrConfidenceState, OcrFieldCandidate } from './types';

/** High enough that a reviewer can treat the value as a starting point, not gospel. */
export const OCR_HIGH_CONFIDENCE_THRESHOLD = 0.8;

export function confidenceState(field: OcrFieldCandidate | null | undefined): OcrConfidenceState {
  if (!field || field.value == null || field.value.trim() === '') return 'not_detected';
  if (field.confidence == null) return 'uncertain';
  if (field.confidence >= OCR_HIGH_CONFIDENCE_THRESHOLD) return 'high';
  return 'uncertain';
}

export function averageConfidence(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}
