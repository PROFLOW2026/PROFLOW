import { afterEach, describe, expect, it } from 'vitest';
import {
  qualifiesAutomaticAbsenceProof,
  SUMIT_ABSENCE_MIN_HOURS_AFTER_ISSUANCE,
  SUMIT_ABSENCE_MIN_HOURS_BETWEEN_SCANS,
  SUMIT_ABSENCE_REQUIRED_EMPTY_SCANS,
  isSumitAbsenceProofEnabled,
  type AbsenceProofScanRecord,
} from '@/modules/invoicing-integration/domain/sumit-absence-proof';

describe('SUMIT automatic absence proof (B02 live-gated)', () => {
  const issuanceRequestedAt = '2026-09-01T12:00:00.000Z';
  const envBackup = process.env.SUMIT_ABSENCE_PROOF_ENABLED;

  afterEach(() => {
    if (envBackup === undefined) {
      delete process.env.SUMIT_ABSENCE_PROOF_ENABLED;
    } else {
      process.env.SUMIT_ABSENCE_PROOF_ENABLED = envBackup;
    }
  });

  it('is disabled unless SUMIT_ABSENCE_PROOF_ENABLED=true (EB-5 gate)', () => {
    delete process.env.SUMIT_ABSENCE_PROOF_ENABLED;
    expect(isSumitAbsenceProofEnabled()).toBe(false);

    process.env.SUMIT_ABSENCE_PROOF_ENABLED = 'true';
    expect(isSumitAbsenceProofEnabled()).toBe(true);

    process.env.SUMIT_ABSENCE_PROOF_ENABLED = '1';
    expect(isSumitAbsenceProofEnabled()).toBe(false);
  });

  function twoEmptyScans(gapHours: number): AbsenceProofScanRecord[] {
    const first = '2026-09-03T12:00:00.000Z';
    const secondMs = Date.parse(first) + gapHours * 60 * 60 * 1000;
    return [
      { completedAt: first, result: 'empty', reason: null },
      { completedAt: new Date(secondMs).toISOString(), result: 'empty', reason: null },
    ];
  }

  it('qualifies only when flag on, issuance age, and two empty scans 6h apart', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const scans = twoEmptyScans(SUMIT_ABSENCE_MIN_HOURS_BETWEEN_SCANS);

    expect(
      qualifiesAutomaticAbsenceProof({
        scans,
        issuanceRequestedAt,
        now,
        absenceProofEnabled: false,
      }),
    ).toBe(false);

    expect(
      qualifiesAutomaticAbsenceProof({
        scans,
        issuanceRequestedAt,
        now,
        absenceProofEnabled: true,
      }),
    ).toBe(true);
  });

  it('rejects proof when fewer than two empty scans or gap is too short', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');

    expect(
      qualifiesAutomaticAbsenceProof({
        scans: [{ completedAt: '2026-09-03T12:00:00.000Z', result: 'empty' }],
        issuanceRequestedAt,
        now,
        absenceProofEnabled: true,
      }),
    ).toBe(false);

    expect(
      qualifiesAutomaticAbsenceProof({
        scans: twoEmptyScans(SUMIT_ABSENCE_MIN_HOURS_BETWEEN_SCANS - 1),
        issuanceRequestedAt,
        now,
        absenceProofEnabled: true,
      }),
    ).toBe(false);

    expect(SUMIT_ABSENCE_REQUIRED_EMPTY_SCANS).toBe(2);
  });

  it('rejects proof when first scan is within 24h of issuance', () => {
    const now = new Date('2026-09-02T11:00:00.000Z');
    const hoursSinceIssuance =
      (now.getTime() - Date.parse(issuanceRequestedAt)) / (60 * 60 * 1000);
    expect(hoursSinceIssuance).toBeLessThan(SUMIT_ABSENCE_MIN_HOURS_AFTER_ISSUANCE);

    expect(
      qualifiesAutomaticAbsenceProof({
        scans: twoEmptyScans(8),
        issuanceRequestedAt,
        now,
        absenceProofEnabled: true,
      }),
    ).toBe(false);
  });

  it('ignores inconclusive scans when counting empty proof scans', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const scans: AbsenceProofScanRecord[] = [
      { completedAt: '2026-09-03T12:00:00.000Z', result: 'inconclusive', reason: 'scan_incomplete' },
      { completedAt: '2026-09-03T18:00:00.000Z', result: 'empty', reason: null },
      { completedAt: '2026-09-04T00:00:00.000Z', result: 'empty', reason: null },
    ];

    expect(
      qualifiesAutomaticAbsenceProof({
        scans,
        issuanceRequestedAt,
        now,
        absenceProofEnabled: true,
      }),
    ).toBe(true);
  });
});
