import type { EffectiveDetection, TakeoffReviewReason } from './contracts';
import { isLegendNoteText } from './legend-identity';

/** Identity of one mark for control / quantities — not the final BOQ document approval. */
export type IdentityReviewStatus = 'autoIdentified' | 'needsCheck' | 'unclassified' | 'manuallyApproved';

export type ReviewPlainKey =
  | 'missingType'
  | 'legendConflict'
  | 'legendUnmapped'
  | 'legendUnread'
  | 'sheetUnassigned'
  | 'looksLikeNote'
  | 'uncertain';

export function detectionIdentityStatus(
  detection: Pick<
    EffectiveDetection,
    'status' | 'needsReview' | 'typeKey' | 'identitySource' | 'originalText' | 'legendUnambiguous' | 'userLabel'
  >,
): IdentityReviewStatus {
  if (detection.status === 'confirmed') return 'manuallyApproved';
  const identified = Boolean(
    detection.typeKey ||
      detection.userLabel?.trim() ||
      (detection.legendUnambiguous && detection.originalText) ||
      detection.identitySource === 'legend' ||
      detection.identitySource === 'library' ||
      detection.identitySource === 'manual',
  );
  if (!identified) return 'unclassified';
  if (detection.needsReview) return 'needsCheck';
  return 'autoIdentified';
}

export function boqLineIdentityStatus(input: {
  readonly verified: boolean;
  readonly identitySource?: string;
  readonly typeKey: string | null;
  readonly originalLabel?: string | null;
  readonly breakdown: { unclassified: number; low: number; medium: number; userConfirmed: number };
  readonly suppressVerified: boolean;
}): IdentityReviewStatus {
  if (input.verified && !input.suppressVerified) return 'manuallyApproved';
  if (input.breakdown.userConfirmed > 0 && input.breakdown.unclassified === 0 && input.breakdown.low === 0) {
    return 'manuallyApproved';
  }
  const identified = Boolean(
    input.typeKey ||
      input.identitySource === 'legend' ||
      input.identitySource === 'library' ||
      input.identitySource === 'manual' ||
      input.originalLabel?.trim(),
  );
  if (!identified || input.breakdown.unclassified > 0) return identified ? 'needsCheck' : 'unclassified';
  if (input.identitySource === 'legend' && !input.typeKey) {
    return input.breakdown.low > 0 || input.breakdown.medium > 0 ? 'needsCheck' : 'autoIdentified';
  }
  if (input.breakdown.low > 0 || input.breakdown.medium > 0) return 'needsCheck';
  return identified ? 'autoIdentified' : 'unclassified';
}

export function reviewPlainKey(
  detection: Pick<EffectiveDetection, 'typeKey' | 'reasons' | 'originalText' | 'legendUnambiguous' | 'legendRowIds'>,
): ReviewPlainKey {
  if (detection.reasons.includes('sheet_unassigned')) return 'sheetUnassigned';
  if (detection.reasons.includes('legend_text_undecodable') || detection.reasons.includes('tag_unread')) {
    return 'legendUnread';
  }
  if (detection.reasons.includes('type_ambiguous')) return 'legendConflict';
  if (detection.reasons.includes('legend_unmapped')) return 'legendUnmapped';
  const text = detection.originalText?.trim();
  if (text && isLegendNoteText(text)) return 'looksLikeNote';
  if (!detection.typeKey && !detection.legendUnambiguous) return 'missingType';
  if (!detection.legendRowIds?.length && !detection.originalText) return 'legendUnmapped';
  return 'uncertain';
}

export function reviewReasonsPlain(reasons: readonly TakeoffReviewReason[]): ReviewPlainKey[] {
  const keys = new Set<ReviewPlainKey>();
  for (const reason of reasons) {
    if (reason === 'sheet_unassigned') keys.add('sheetUnassigned');
    else if (reason === 'legend_text_undecodable' || reason === 'tag_unread') keys.add('legendUnread');
    else if (reason === 'type_ambiguous') keys.add('legendConflict');
    else if (reason === 'legend_unmapped') keys.add('legendUnmapped');
    else if (reason === 'unclassified') keys.add('missingType');
    else keys.add('uncertain');
  }
  return [...keys];
}
