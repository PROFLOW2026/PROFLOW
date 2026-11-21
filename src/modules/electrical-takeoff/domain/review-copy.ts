import type { EffectiveDetection, TakeoffReviewReason } from './contracts';
import { classifyLegendText, isLegendHoldText, isLegendNoteText } from './legend-identity';

type ConfirmableLegendDetection = Pick<
  EffectiveDetection,
  'originalText' | 'userLabel' | 'legendUnambiguous' | 'identitySource' | 'reasons'
>;

/**
 * A planner legend name can be approved without inventing a catalog typeKey.
 * Conflict, unread, note and cable rows still need a catalog pick or a user name.
 */
export function hasConfirmableLegendName(
  detection: ConfirmableLegendDetection,
  extraName?: string,
): boolean {
  if (detection.reasons.includes('type_ambiguous') && detection.legendUnambiguous !== true) return false;
  const userName = extraName?.trim() || detection.userLabel?.trim() || '';
  if (userName) return true;
  const legendName = detection.originalText?.trim() || '';
  if (!legendName || isLegendHoldText(legendName)) return false;
  return Boolean(detection.legendUnambiguous || detection.identitySource === 'legend');
}

export function canSaveReviewIdentity(
  typeKey: string | null | undefined,
  detection: ConfirmableLegendDetection,
  extraName?: string,
): boolean {
  if (typeKey?.trim()) return true;
  return hasConfirmableLegendName(detection, extraName);
}

/** Identity of one mark for control / quantities — not the final BOQ document approval. */
export type IdentityReviewStatus = 'autoIdentified' | 'needsCheck' | 'unclassified' | 'manuallyApproved';

export type ReviewPlainKey =
  | 'missingType'
  | 'legendConflict'
  | 'legendUnmapped'
  | 'legendUnread'
  | 'sheetUnassigned'
  | 'looksLikeNote'
  | 'looksLikeLinear'
  | 'looksLikeSiteWork'
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
      detection.originalText?.trim() ||
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
  const text = detection.originalText?.trim();
  if (text && classifyLegendText(text) === 'linear') return 'looksLikeLinear';
  if (text && classifyLegendText(text) === 'site_work') return 'looksLikeSiteWork';
  if (text && isLegendNoteText(text)) return 'looksLikeNote';
  if (detection.reasons.includes('legend_unmapped')) return 'legendUnmapped';
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
