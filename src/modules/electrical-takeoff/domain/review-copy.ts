import type { EffectiveDetection, TakeoffReviewReason } from './contracts';
import { classifyLegendText, isLegendHoldText, isLegendNoteText } from './legend-identity';

type ConfirmableLegendDetection = Pick<
  EffectiveDetection,
  'originalText' | 'userLabel' | 'legendUnambiguous' | 'identitySource' | 'reasons'
>;

/**
 * A planner legend name can be approved without inventing a catalog typeKey.
 * Catalog-family `type_ambiguous` is not a legend conflict. Notes, cables and
 * site work still need a catalog pick or a typed name.
 */
export function hasConfirmableLegendName(
  detection: ConfirmableLegendDetection,
  extraName?: string,
): boolean {
  const userName = extraName?.trim() || detection.userLabel?.trim() || '';
  if (userName) return true;
  const legendName = detection.originalText?.trim() || '';
  if (!legendName || isLegendHoldText(legendName)) return false;
  return true;
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
export type IdentityReviewStatus =
  | 'autoIdentified'
  | 'needsCheck'
  | 'unclassified'
  | 'manuallyApproved'
  | 'partiallyApproved';

export type BoqIdentityBreakdown = {
  unclassified: number;
  high?: number;
  low: number;
  medium: number;
  userConfirmed: number;
};

export function boqLineConfirmationCounts(breakdown: BoqIdentityBreakdown): {
  total: number;
  confirmed: number;
  pending: number;
} {
  const total =
    (breakdown.high ?? 0) + breakdown.medium + breakdown.low + breakdown.unclassified;
  const confirmed = Math.max(0, Math.min(breakdown.userConfirmed, total || breakdown.userConfirmed));
  const pending = Math.max(0, total - confirmed);
  return { total, confirmed, pending };
}

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
  readonly breakdown: BoqIdentityBreakdown;
  readonly suppressVerified: boolean;
}): IdentityReviewStatus {
  if (input.verified && !input.suppressVerified) return 'manuallyApproved';
  const { total, confirmed, pending } = boqLineConfirmationCounts(input.breakdown);
  if (confirmed > 0 && total > 0 && pending === 0) return 'manuallyApproved';
  if (confirmed > 0 && pending > 0) return 'partiallyApproved';
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

function hasLegendTextConflict(
  detection: Pick<EffectiveDetection, 'legendUnambiguous' | 'legendRowIds'> & { legendHoldReason?: string },
): boolean {
  if (detection.legendUnambiguous === true) return false;
  if (detection.legendHoldReason === 'conflict') return true;
  return (detection.legendRowIds?.length ?? 0) > 1;
}

export function reviewPlainKey(
  detection: Pick<EffectiveDetection, 'typeKey' | 'reasons' | 'originalText' | 'legendUnambiguous' | 'legendRowIds'> & {
    legendHoldReason?: string;
  },
): ReviewPlainKey {
  if (detection.reasons.includes('sheet_unassigned')) return 'sheetUnassigned';
  if (detection.reasons.includes('legend_text_undecodable') || detection.reasons.includes('tag_unread')) {
    return 'legendUnread';
  }
  if (hasLegendTextConflict(detection)) return 'legendConflict';
  const text = detection.originalText?.trim();
  if (text && classifyLegendText(text) === 'linear') return 'looksLikeLinear';
  if (text && classifyLegendText(text) === 'site_work') return 'looksLikeSiteWork';
  if (text && isLegendNoteText(text)) return 'looksLikeNote';
  if (detection.reasons.includes('legend_unmapped') && !text) return 'legendUnmapped';
  if (!detection.typeKey && !text && !detection.legendUnambiguous) return 'missingType';
  if (!detection.legendRowIds?.length && !text) return 'legendUnmapped';
  return 'uncertain';
}

export function reviewReasonsPlain(reasons: readonly TakeoffReviewReason[]): ReviewPlainKey[] {
  const keys = new Set<ReviewPlainKey>();
  for (const reason of reasons) {
    if (reason === 'sheet_unassigned') keys.add('sheetUnassigned');
    else if (reason === 'legend_text_undecodable' || reason === 'tag_unread') keys.add('legendUnread');
    else if (reason === 'type_ambiguous') keys.add('uncertain');
    else if (reason === 'legend_unmapped') keys.add('legendUnmapped');
    else if (reason === 'unclassified') keys.add('missingType');
    else keys.add('uncertain');
  }
  return [...keys];
}
