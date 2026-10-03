import { approvedContractValue } from '@/modules/subcontracts/domain/value';
import type { DbExecutor } from '@/shared/db/types';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { addMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { effectiveCertifiedByLine } from '../domain/assessments';
import { computeLineFigures, lineContractValue, moneyOf, type LineFigures } from '../domain/line-math';
import {
  listAssessments,
  listClaimLines,
  listPriorCertifiedFacts,
  listRevisions,
  listSubmissions,
  type AssessmentRow,
  type ClaimRevisionRow,
  type ClaimRow,
  type ClaimSubmissionRow,
} from '../data/claims.repository';
import {
  loadAgreementTerms,
  loadContractBasis,
  type AgreementTerms,
  type ContractBasisLine,
} from '../data/contract-basis.repository';

/**
 * Loads everything the claim math needs for ONE claim through the caller's RLS-bound executor and the
 * authorized definer ports. Shared by internal and contractor use-cases so both see identical numbers.
 */

export function sqlStateOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Definer ports raise 42501 when the caller has no claim/payment access: surface as authorization. */
export async function withPortAccess<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (sqlStateOf(error) === '42501') throw new AuthorizationError('subcontract-claims:agreement');
    throw error;
  }
}

export interface AgreementContext {
  readonly terms: AgreementTerms;
  readonly basis: readonly ContractBasisLine[];
  readonly basisByWorkLine: ReadonlyMap<string, ContractBasisLine>;
  readonly contractValue: MoneyValue;
}

export async function loadAgreementContext(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<AgreementContext> {
  return withPortAccess(async () => {
    const terms = await loadAgreementTerms(db, organizationId, agreementId);
    if (!terms) throw new NotFoundError('Subcontract agreement');
    const basis = await loadContractBasis(db, organizationId, agreementId);
    const contract = approvedContractValue({
      currency: terms.currency,
      draftOriginalAmount: terms.originalAmount,
      events: [
        ...(terms.originalEventAmount !== null
          ? [{ kind: 'original', amount: terms.originalEventAmount, currency: terms.currency }]
          : []),
        { kind: 'adjustment', amount: terms.changeEventsAmount, currency: terms.currency },
      ],
    });
    return {
      terms,
      basis,
      basisByWorkLine: new Map(basis.map((line) => [line.workLineId, line])),
      contractValue: contract.current,
    };
  });
}

/** Prior certified cumulative per work line from EARLIER certified claims (effective decisions only). */
export async function loadPriorCertified(
  db: DbExecutor,
  organizationId: string,
  claim: Pick<ClaimRow, 'id' | 'agreementId' | 'claimNumber' | 'currency'>,
): Promise<Map<string, MoneyValue>> {
  const facts = await listPriorCertifiedFacts(db, organizationId, claim.agreementId, claim.claimNumber, claim.id);
  const effective = effectiveCertifiedByLine(facts, claim.currency);
  const workLineOf = new Map(facts.map((fact) => [fact.claimLineId!, fact.workLineId]));
  const byWorkLine = new Map<string, MoneyValue>();
  for (const [claimLineId, amount] of effective) {
    const workLineId = workLineOf.get(claimLineId);
    if (!workLineId) continue;
    byWorkLine.set(workLineId, addMoney(byWorkLine.get(workLineId) ?? zeroMoney(claim.currency), amount));
  }
  return byWorkLine;
}

export interface ComputedClaimLine {
  readonly claimLineId: string;
  readonly workLineId: string;
  readonly basis: ContractBasisLine | null;
  readonly submission: ClaimSubmissionRow | null;
  readonly figures: LineFigures;
}

export interface ClaimState {
  readonly agreement: AgreementContext;
  readonly revisions: readonly ClaimRevisionRow[];
  readonly activeRevision: ClaimRevisionRow;
  readonly assessments: readonly AssessmentRow[];
  readonly effectiveCertified: ReadonlyMap<string, MoneyValue>;
  readonly priorByWorkLine: ReadonlyMap<string, MoneyValue>;
  readonly lines: readonly ComputedClaimLine[];
}

export async function loadClaimState(db: DbExecutor, organizationId: string, claim: ClaimRow): Promise<ClaimState> {
  const agreement = await loadAgreementContext(db, organizationId, claim.agreementId);
  const [revisions, claimLines, assessments, priorByWorkLine] = await Promise.all([
    listRevisions(db, organizationId, claim.id),
    listClaimLines(db, organizationId, claim.id),
    listAssessments(db, organizationId, [claim.id]),
    loadPriorCertified(db, organizationId, claim),
  ]);
  const activeRevision = revisions.find((revision) => revision.revisionNo === claim.currentRevisionNo);
  if (!activeRevision) throw new NotFoundError('Claim revision');
  const submissions = await listSubmissions(db, organizationId, [activeRevision.id]);
  const submissionByLine = new Map(submissions.map((row) => [row.claimLineId, row]));
  const effectiveCertified = effectiveCertifiedByLine(assessments, claim.currency);
  const currency = claim.currency;

  const lines = claimLines
    .map((line) => {
      const basis = agreement.basisByWorkLine.get(line.workLineId) ?? null;
      const submission = submissionByLine.get(line.id) ?? null;
      const value = basis
        ? lineContractValue(basis, currency)
        : { contractBaseline: zeroMoney(currency), approvedChanges: zeroMoney(currency), revised: zeroMoney(currency) };
      return {
        claimLineId: line.id,
        workLineId: line.workLineId,
        basis,
        submission,
        figures: computeLineFigures({
          value,
          priorCertified: priorByWorkLine.get(line.workLineId) ?? zeroMoney(currency),
          currentSubmitted: moneyOf(submission?.currentAmount, currency),
          currentCertified: effectiveCertified.get(line.id) ?? null,
        }),
      };
    })
    .sort((a, b) => (a.basis?.sortOrder ?? 0) - (b.basis?.sortOrder ?? 0));

  return { agreement, revisions, activeRevision, assessments, effectiveCertified, priorByWorkLine, lines };
}
