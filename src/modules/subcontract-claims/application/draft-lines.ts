import type { Actor } from '@/shared/actor';
import { actorColumns } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError } from '@/shared/errors';
import { addMoney, money, zeroMoney, type MoneyValue } from '@/shared/money';
import { assertWithinCeiling, lineContractValue } from '../domain/line-math';
import {
  insertClaimLines,
  listClaimLines,
  listSubmissions,
  replaceDraftSubmissions,
  updateClaimRow,
  updateRevisionRow,
  type ClaimRevisionRow,
  type ClaimRow,
} from '../data/claims.repository';
import type { AgreementContext } from './claim-engine';

/**
 * Writes the lines of a DRAFT revision (internal or contractor). Every line must be a live work line of
 * the claim's agreement; the snapshot (baseline / approved changes / revised / prior certified) is taken
 * now and refreshed on submit. The cumulative claimed amount may never exceed the revised line value.
 */

export interface DraftLineValues {
  readonly workLineId: string;
  readonly currentAmount: string;
  readonly progressPercent?: string | null;
  readonly cumulativeQuantity?: string | null;
  readonly note?: string | null;
}

export async function writeDraftLines(
  db: DbExecutor,
  input: {
    readonly claim: ClaimRow;
    readonly revision: ClaimRevisionRow;
    readonly agreement: AgreementContext;
    readonly priorByWorkLine: ReadonlyMap<string, MoneyValue>;
    readonly lines: readonly DraftLineValues[];
  },
): Promise<void> {
  const { claim, revision, agreement } = input;
  if (revision.submittedAt) {
    throw new DomainRuleError('Submitted revisions are immutable', 'subcontractClaims.errors.revisionSubmitted');
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.workLineId)) {
      throw new DomainRuleError('Duplicate work line', 'subcontractClaims.errors.duplicateLine');
    }
    seen.add(line.workLineId);
    const basis = agreement.basisByWorkLine.get(line.workLineId);
    if (!basis || basis.lineStatus === 'cancelled') {
      throw new DomainRuleError('Work line is not part of this agreement', 'subcontractClaims.errors.unknownWorkLine');
    }
  }

  const existing = await listClaimLines(db, claim.organizationId, claim.id);
  const lineIdByWorkLine = new Map(existing.map((row) => [row.workLineId, row.id]));
  const missing = input.lines.filter((line) => !lineIdByWorkLine.has(line.workLineId));
  const created = missing.map((line) => ({
    id: crypto.randomUUID(),
    organizationId: claim.organizationId,
    projectId: claim.projectId,
    agreementId: claim.agreementId,
    claimId: claim.id,
    workLineId: line.workLineId,
  }));
  await insertClaimLines(db, created);
  for (const row of created) lineIdByWorkLine.set(row.workLineId, row.id);

  const currency = claim.currency;
  const rows = input.lines.map((line) => {
    const basis = agreement.basisByWorkLine.get(line.workLineId)!;
    const value = lineContractValue(basis, currency);
    const prior = input.priorByWorkLine.get(line.workLineId) ?? zeroMoney(currency);
    const current = money(line.currentAmount, currency);
    assertWithinCeiling({
      revised: value.revised,
      priorCertified: prior,
      current,
      kind: 'submitted',
      lineLabel: basis.code ?? basis.description,
    });
    return {
      organizationId: claim.organizationId,
      projectId: claim.projectId,
      claimId: claim.id,
      revisionId: revision.id,
      claimLineId: lineIdByWorkLine.get(line.workLineId)!,
      currency,
      currentAmount: current.amount,
      cumulativeAmount: addMoney(prior, current).amount,
      progressPercent: line.progressPercent ?? null,
      cumulativeQuantity: line.cumulativeQuantity ?? null,
      note: line.note ?? null,
      contractBaseline: value.contractBaseline.amount,
      approvedChanges: value.approvedChanges.amount,
      revisedValue: value.revised.amount,
      priorCertified: prior.amount,
    };
  });
  await replaceDraftSubmissions(db, claim.organizationId, revision.id, rows);
}

/**
 * Freezes the draft revision: re-takes the snapshot with current contract values (the ceiling is checked
 * again), stamps the submitter and moves the claim to `submitted`.
 */
export async function freezeRevision(
  db: DbExecutor,
  input: {
    readonly claim: ClaimRow;
    readonly revision: ClaimRevisionRow;
    readonly agreement: AgreementContext;
    readonly priorByWorkLine: ReadonlyMap<string, MoneyValue>;
    readonly actor: Actor;
  },
): Promise<void> {
  const { claim, revision } = input;
  const submissions = await listSubmissions(db, claim.organizationId, [revision.id]);
  if (submissions.length === 0) {
    throw new DomainRuleError('A claim needs at least one line', 'subcontractClaims.errors.noLines');
  }
  const lines = await listClaimLines(db, claim.organizationId, claim.id);
  const workLineOf = new Map(lines.map((line) => [line.id, line.workLineId]));
  await writeDraftLines(db, {
    claim,
    revision,
    agreement: input.agreement,
    priorByWorkLine: input.priorByWorkLine,
    lines: submissions.map((row) => ({
      workLineId: workLineOf.get(row.claimLineId)!,
      currentAmount: row.currentAmount,
      progressPercent: row.progressPercent,
      cumulativeQuantity: row.cumulativeQuantity,
      note: row.note,
    })),
  });
  const columns = actorColumns(input.actor);
  const now = new Date();
  await updateRevisionRow(db, claim.organizationId, revision.id, {
    submittedAt: now,
    submittedActorType: columns.actorType === 'external' ? 'external' : 'internal',
    submittedByUserId: columns.actorUserId,
    submittedByPrincipalId: columns.actorPrincipalId,
  });
  await updateClaimRow(db, claim.organizationId, claim.id, { status: 'submitted', submittedAt: now });
}
