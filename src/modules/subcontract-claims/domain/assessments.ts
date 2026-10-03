import { DomainRuleError } from '@/shared/errors';
import { money, type MoneyValue } from '@/shared/money';
import { LINE_CERTIFYING_DECISIONS, type ClaimAssessmentDecision } from './types';

/**
 * Assessments are append-only facts (DB trigger). The effective certified amount of a line is the
 * latest line-certifying decision (certify / reassess / reject_line) by sequence; earlier decisions
 * stay visible: submitted 80 -> certified 60 -> reassessed 70 are three preserved rows.
 */

export interface AssessmentFact {
  readonly seq: number;
  readonly claimLineId: string | null;
  readonly decision: ClaimAssessmentDecision;
  readonly certifiedAmount: string | null;
}

export function isLineCertifying(decision: ClaimAssessmentDecision): boolean {
  return LINE_CERTIFYING_DECISIONS.includes(decision);
}

/** claimLineId -> effective certified amount (latest decision wins). */
export function effectiveCertifiedByLine(
  facts: readonly AssessmentFact[],
  currency: string,
): Map<string, MoneyValue> {
  const latest = new Map<string, AssessmentFact>();
  for (const fact of facts) {
    if (!fact.claimLineId || !isLineCertifying(fact.decision) || fact.certifiedAmount === null) continue;
    const current = latest.get(fact.claimLineId);
    if (!current || fact.seq > current.seq) latest.set(fact.claimLineId, fact);
  }
  const result = new Map<string, MoneyValue>();
  for (const [lineId, fact] of latest) result.set(lineId, money(fact.certifiedAmount!, currency));
  return result;
}

export function hasLineDecision(facts: readonly AssessmentFact[], claimLineId: string): boolean {
  return facts.some((fact) => fact.claimLineId === claimLineId && isLineCertifying(fact.decision));
}

export function requireReason(reason: string | null | undefined, messageKey: string): string {
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length === 0) {
    throw new DomainRuleError('A reason is required', messageKey);
  }
  return trimmed;
}

/** Certification covers every claim line exactly once. */
export function assertCompleteLineSet(
  claimLineIds: readonly string[],
  decidedLineIds: readonly string[],
): void {
  const expected = new Set(claimLineIds);
  const seen = new Set<string>();
  for (const id of decidedLineIds) {
    if (!expected.has(id) || seen.has(id)) {
      throw new DomainRuleError('Unknown or duplicate claim line', 'subcontractClaims.errors.unknownLine');
    }
    seen.add(id);
  }
  if (seen.size !== expected.size) {
    throw new DomainRuleError(
      'Every claim line needs a certification decision',
      'subcontractClaims.errors.missingLineDecisions',
    );
  }
}
