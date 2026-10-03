import { sumMoney, zeroMoney } from '@/shared/money';
import { effectiveCertifiedByLine } from '../domain/assessments';
import { lineFiguresView, sumFigures } from '../domain/line-math';
import type {
  ClaimAssessmentView,
  ClaimDetailView,
  ClaimHeaderView,
  ClaimListItem,
  ClaimRevisionView,
  PayableBasisView,
} from '../domain/types';
import type { AssessmentRow, ClaimRowWithNames } from '../data/claims.repository';
import type { PayableBasisRow } from '../data/financial.repository';
import type { ClaimState } from './claim-engine';
import { isoOrNull } from './support';

export function toHeaderView(claim: ClaimRowWithNames): ClaimHeaderView {
  return {
    id: claim.id,
    organizationId: claim.organizationId,
    projectId: claim.projectId,
    vendorId: claim.vendorId,
    vendorName: claim.vendorName,
    agreementId: claim.agreementId,
    agreementTitle: claim.agreementTitle,
    claimNumber: claim.claimNumber,
    periodStart: claim.periodStart,
    periodEnd: claim.periodEnd,
    title: claim.title,
    status: claim.status,
    currentRevisionNo: claim.currentRevisionNo,
    currency: claim.currency,
    createdActorType: claim.createdActorType,
    submittedAt: isoOrNull(claim.submittedAt),
    certifiedAt: isoOrNull(claim.certifiedAt),
    lastReassessedAt: isoOrNull(claim.lastReassessedAt),
    createdAt: claim.createdAt.toISOString(),
  };
}

export function toBasisView(row: PayableBasisRow): PayableBasisView {
  return {
    id: row.id,
    version: row.version,
    sourceDecision: row.sourceDecision,
    certifiedTotal: row.certifiedTotal,
    certifiedDelta: row.certifiedDelta,
    retentionPercent: row.retentionPercent,
    retentionAmount: row.retentionAmount,
    advanceRecoveryAmount: row.advanceRecoveryAmount,
    deductionsAmount: row.deductionsAmount,
    payableNet: row.payableNet,
    apBillStatus: row.apBillStatus,
    apBillId: row.apBillId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAssessmentView(row: AssessmentRow, revisionNoById: ReadonlyMap<string, number>): ClaimAssessmentView {
  return {
    id: row.id,
    seq: row.seq,
    revisionNo: revisionNoById.get(row.revisionId) ?? 0,
    claimLineId: row.claimLineId,
    decision: row.decision,
    certifiedAmount: row.certifiedAmount,
    reason: row.reason,
    assessorName: row.assessorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDetailView(
  claim: ClaimRowWithNames,
  state: ClaimState,
  bases: readonly PayableBasisRow[],
): ClaimDetailView {
  const revisionNoById = new Map(state.revisions.map((revision) => [revision.id, revision.revisionNo]));
  const revisions: ClaimRevisionView[] = state.revisions.map((revision) => ({
    id: revision.id,
    revisionNo: revision.revisionNo,
    note: revision.note,
    submittedAt: isoOrNull(revision.submittedAt),
    submittedBy: revision.submittedActorType ?? null,
  }));
  const submitted = state.activeRevision.submittedAt !== null;
  return {
    header: toHeaderView(claim),
    revisions,
    activeRevisionId: state.activeRevision.id,
    activeRevisionSubmitted: submitted,
    lines: state.lines.map((line) => ({
      claimLineId: line.claimLineId,
      workLineId: line.workLineId,
      code: line.basis?.code ?? null,
      description: line.basis?.description ?? '',
      unit: line.basis?.unit ?? '',
      quantity: line.basis?.quantity ?? '0',
      progressPercent: line.submission?.progressPercent ?? null,
      cumulativeQuantity: line.submission?.cumulativeQuantity ?? null,
      note: line.submission?.note ?? null,
      figures: lineFiguresView(line.figures),
      submittedSnapshot:
        submitted && line.submission
          ? { revisedValue: line.submission.revisedValue, priorCertified: line.submission.priorCertified }
          : null,
    })),
    totals: sumFigures(
      state.lines.map((line) => line.figures),
      claim.currency,
    ),
    assessments: state.assessments.map((row) => toAssessmentView(row, revisionNoById)),
    payableBases: bases.map(toBasisView),
  };
}

export function toListItems(
  rows: readonly ClaimRowWithNames[],
  submittedTotals: ReadonlyMap<string, string>,
  assessments: readonly AssessmentRow[],
): ClaimListItem[] {
  const byClaim = new Map<string, AssessmentRow[]>();
  for (const row of assessments) byClaim.set(row.claimId, [...(byClaim.get(row.claimId) ?? []), row]);
  return rows.map((row) => {
    const effective = effectiveCertifiedByLine(byClaim.get(row.id) ?? [], row.currency);
    return {
      id: row.id,
      projectId: row.projectId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      agreementId: row.agreementId,
      agreementTitle: row.agreementTitle,
      claimNumber: row.claimNumber,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      currentRevisionNo: row.currentRevisionNo,
      currency: row.currency,
      submittedAt: isoOrNull(row.submittedAt),
      certifiedAt: isoOrNull(row.certifiedAt),
      currentSubmitted: submittedTotals.get(row.id) ?? zeroMoney(row.currency).amount,
      currentCertified: effective.size > 0 ? sumMoney([...effective.values()], row.currency).amount : null,
    };
  });
}
