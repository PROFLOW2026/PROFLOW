/** Income document types (0,1,2,3,5). Expense types are excluded. */
export const SUMIT_INCOME_DOCUMENT_TYPES = [0, 1, 2, 3, 5] as const;

export const SUMIT_ABSENCE_SCAN_CANDIDATE_CAP = 200;

export const SUMIT_ABSENCE_MIN_HOURS_AFTER_ISSUANCE = 24;
export const SUMIT_ABSENCE_MIN_HOURS_BETWEEN_SCANS = 6;
export const SUMIT_ABSENCE_REQUIRED_EMPTY_SCANS = 2;

export function isSumitAbsenceProofEnabled(): boolean {
  return process.env.SUMIT_ABSENCE_PROOF_ENABLED === 'true';
}

export interface AbsenceProofScanRecord {
  readonly completedAt: string;
  readonly result: 'empty' | 'found' | 'inconclusive';
  readonly reason?: string | null;
}

export interface AbsenceProofMetadata {
  readonly absenceProofScans?: readonly AbsenceProofScanRecord[];
  readonly manualAbsenceConfirmedAt?: string | null;
}

export function absenceProofFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AbsenceProofMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  const scans = metadata.absenceProofScans;
  const manualAbsenceConfirmedAt = metadata.manualAbsenceConfirmedAt;
  return {
    absenceProofScans: Array.isArray(scans)
      ? (scans as AbsenceProofScanRecord[])
      : undefined,
    manualAbsenceConfirmedAt:
      typeof manualAbsenceConfirmedAt === 'string' ? manualAbsenceConfirmedAt : null,
  };
}

export function mergeAbsenceProofMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: AbsenceProofMetadata,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' ? { ...existing } : ({} as Record<string, unknown>);
  if (patch.absenceProofScans !== undefined) {
    base.absenceProofScans = patch.absenceProofScans;
  }
  if (patch.manualAbsenceConfirmedAt !== undefined) {
    base.manualAbsenceConfirmedAt = patch.manualAbsenceConfirmedAt;
  }
  return base;
}

export function hasManualAbsenceConfirmation(metadata: AbsenceProofMetadata): boolean {
  return Boolean(metadata.manualAbsenceConfirmedAt?.trim());
}

export function qualifiesAutomaticAbsenceProof(input: {
  readonly scans: readonly AbsenceProofScanRecord[];
  readonly issuanceRequestedAt: string;
  readonly now: Date;
  readonly absenceProofEnabled: boolean;
}): boolean {
  if (!input.absenceProofEnabled) return false;

  const issuanceAt = Date.parse(input.issuanceRequestedAt);
  if (!Number.isFinite(issuanceAt)) return false;
  const hoursSinceIssuance = (input.now.getTime() - issuanceAt) / (60 * 60 * 1000);
  if (hoursSinceIssuance < SUMIT_ABSENCE_MIN_HOURS_AFTER_ISSUANCE) return false;

  const emptyScans = input.scans
    .filter((scan) => scan.result === 'empty')
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));

  if (emptyScans.length < SUMIT_ABSENCE_REQUIRED_EMPTY_SCANS) return false;

  const first = emptyScans[0]!;
  const second = emptyScans[emptyScans.length - 1]!;
  const gapHours =
    (Date.parse(second.completedAt) - Date.parse(first.completedAt)) / (60 * 60 * 1000);
  return gapHours >= SUMIT_ABSENCE_MIN_HOURS_BETWEEN_SCANS;
}
