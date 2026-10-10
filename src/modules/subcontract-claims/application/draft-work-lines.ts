import { zeroMoney } from '@/shared/money';
import { computeLineFigures, lineContractValue, lineFiguresView, moneyOf } from '../domain/line-math';
import type { ClaimLineFiguresView } from '../domain/types';
import type { ClaimState } from './claim-engine';

export interface ClaimDraftWorkLine {
  readonly workLineId: string;
  readonly code: string | null;
  readonly description: string;
  readonly unit: string;
  readonly contractQuantity: string;
  readonly lineType: string;
  readonly progressPercent: string | null;
  readonly cumulativeQuantity: string | null;
  readonly note: string | null;
  readonly currentAmount: string;
  readonly figures: ClaimLineFiguresView;
}

/** All live agreement work lines with draft submission values (for contractor + internal editors). */
export function buildClaimDraftWorkLines(state: ClaimState, currency: string): ClaimDraftWorkLine[] {
  const submissionByWorkLine = new Map<string, (typeof state.lines)[number]['submission']>();
  for (const line of state.lines) {
    if (line.submission) submissionByWorkLine.set(line.workLineId, line.submission);
  }

  const rows: ClaimDraftWorkLine[] = [];
  for (const basis of state.agreement.basis) {
    if (basis.lineStatus === 'cancelled') continue;
    const value = lineContractValue(basis, currency);
    const prior = state.priorByWorkLine.get(basis.workLineId) ?? zeroMoney(currency);
    const submission = submissionByWorkLine.get(basis.workLineId);
    const currentSubmitted = moneyOf(submission?.currentAmount ?? '0', currency);
    const figures = computeLineFigures({
      value,
      priorCertified: prior,
      currentSubmitted,
      currentCertified: null,
    });
    rows.push({
      workLineId: basis.workLineId,
      code: basis.code,
      description: basis.description,
      unit: basis.unit,
      contractQuantity: basis.quantity,
      lineType: basis.lineType,
      progressPercent: submission?.progressPercent ?? null,
      cumulativeQuantity: submission?.cumulativeQuantity ?? null,
      note: submission?.note ?? null,
      currentAmount: currentSubmitted.amount,
      figures: lineFiguresView(figures),
    });
  }

  return rows.sort((a, b) => a.description.localeCompare(b.description));
}
