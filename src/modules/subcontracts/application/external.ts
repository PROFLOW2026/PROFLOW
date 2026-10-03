import { randomUUID } from 'node:crypto';
import { externalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, writeAuditEvent } from '@/shared/audit';
import { withTransaction } from '@/shared/db';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { Transaction } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
  type ExternalScopeTarget,
} from '@/shared/external';
import { toNumericString } from '@/shared/money';
import { findAgreementFinancial, findAgreementOperational } from '../data/agreements.repository';
import {
  findChange,
  insertChange,
  insertVersion,
  listAgreementChanges,
  listVersionsForChanges,
  nextChangeNumber,
  nextVersionNo,
} from '../data/changes.repository';
import { assertAgreementAcceptsChanges, assertChangeAction } from '../domain/lifecycle';
import type { AgreementFinancialView, AgreementOperationalView, ChangeView, WorkLineView } from '../domain/types';
import { assertChangeAmountSign } from '../domain/value';
import {
  contractorCounterSchema,
  contractorProposalSchema,
  type ContractorCounterInput,
  type ContractorProposalInput,
} from '../validation/schemas';
import { parseOrThrow } from './access';
import { prepareVersionLines } from './changes';
import { buildAgreementLines } from './read-models';

const E = DOMAIN_EVENTS;

function scopeOf(agreement: AgreementOperationalView): ExternalScopeTarget {
  return {
    organizationId: agreement.organizationId,
    projectId: agreement.projectId,
    vendorId: agreement.vendorId,
    subcontractAgreementId: agreement.id,
  };
}

/** Agreement visible through RLS AND covered by a grant; otherwise NotFound (no existence oracle). */
async function loadExternalAgreement(
  context: ExternalContext,
  input: { organizationId: string; projectId: string; agreementId: string },
): Promise<AgreementOperationalView> {
  const agreement = await findAgreementOperational(context.db, input.organizationId, input.agreementId);
  if (!agreement || agreement.projectId !== input.projectId || agreement.status === 'draft' || agreement.status === 'cancelled') {
    throw new NotFoundError('Subcontract agreement');
  }
  if (!hasExternalScope(context, scopeOf(agreement), X.PROJECT_VIEW)) throw new NotFoundError('Subcontract agreement');
  return agreement;
}

/** Portal routes carry project + agreement only; the organization comes from the principal's grants. */
export async function resolveContractorAgreementOrganization(
  context: ExternalContext,
  input: { projectId: string; agreementId: string },
): Promise<string> {
  const organizationIds = [...new Set(context.grants.map((grant) => grant.organizationId))];
  for (const organizationId of organizationIds) {
    const agreement = await findAgreementOperational(context.db, organizationId, input.agreementId);
    if (agreement && agreement.projectId === input.projectId) return organizationId;
  }
  throw new NotFoundError('Subcontract agreement');
}

export interface ContractorAgreementView {
  readonly agreement: AgreementOperationalView;
  readonly lines: readonly WorkLineView[];
  /** null unless the grant carries ext.contract.view_value. */
  readonly financial: Pick<
    AgreementFinancialView,
    'currency' | 'originalAmount' | 'approvedChangesAmount' | 'currentAmount' | 'retentionPercent'
  > | null;
  readonly canProposeChange: boolean;
}

/** Contractor portal: own agreement lines; values only with ext.contract.view_value. */
export async function getContractorAgreement(
  context: ExternalContext,
  input: { organizationId: string; projectId: string; agreementId: string },
): Promise<ContractorAgreementView> {
  const agreement = await loadExternalAgreement(context, input);
  const withValue = hasExternalScope(context, scopeOf(agreement), X.CONTRACT_VIEW_VALUE);
  const { lines, financial } = await buildAgreementLines(context.db, agreement.organizationId, agreement.id, withValue);
  return {
    agreement,
    lines: lines.map((line) => ({ ...line, notes: null })),
    financial: financial
      ? {
          currency: financial.currency,
          originalAmount: financial.originalAmount,
          approvedChangesAmount: financial.approvedChangesAmount,
          currentAmount: financial.currentAmount,
          retentionPercent: financial.retentionPercent,
        }
      : null,
    canProposeChange: hasExternalScope(context, scopeOf(agreement), X.CHANGE_REQUEST),
  };
}

/** Contractor portal: changes of the agreement (internal drafts are invisible by RLS). */
export async function listContractorChanges(
  context: ExternalContext,
  input: { organizationId: string; projectId: string; agreementId: string },
): Promise<{ agreement: AgreementOperationalView; changes: ChangeView[]; canProposeChange: boolean }> {
  const agreement = await loadExternalAgreement(context, input);
  const canProposeChange = hasExternalScope(context, scopeOf(agreement), X.CHANGE_REQUEST);
  const rows = await listAgreementChanges(context.db, agreement.organizationId, agreement.id);
  if (!canProposeChange) {
    return {
      agreement,
      changes: rows.map(({ approvedVersionId: _approved, ...row }) => row),
      canProposeChange,
    };
  }
  const versions = await listVersionsForChanges(
    context.db,
    agreement.organizationId,
    rows.map((row) => row.id),
  );
  return {
    agreement,
    changes: rows.map((row) => ({ ...row, versions: versions.get(row.id) ?? [] })),
    canProposeChange,
  };
}

async function auditExternal(
  tx: Transaction,
  context: ExternalContext,
  organizationId: string,
  action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
  entityId: string,
  after: Record<string, unknown>,
): Promise<void> {
  await asServiceRoleWrite(tx, () =>
    writeAuditEvent(tx, {
      organizationId,
      actorUserId: null,
      action,
      entityType: 'subcontract_change',
      entityId,
      after,
      metadata: { actor: { type: 'external', principalId: context.principalId } },
    }),
  );
}

/** Contractor proposes a priced change (ext.change.request). Lands as `submitted`; never moves value. */
export async function submitContractorChangeProposal(
  context: ExternalContext,
  rawInput: ContractorProposalInput,
): Promise<{ changeId: string }> {
  const input = parseOrThrow(contractorProposalSchema.safeParse(rawInput));
  const agreement = await loadExternalAgreement(context, input);
  requireExternalScope(context, scopeOf(agreement), X.CHANGE_REQUEST);
  assertAgreementAcceptsChanges(agreement.status);

  return withTransaction(context.db, async (tx) => {
    const terms = await findAgreementFinancial(tx, agreement.organizationId, agreement.id);
    const currency = terms?.currency ?? 'ILS';
    const { lines, total } = await prepareVersionLines(tx, agreement.organizationId, agreement.id, currency, input);
    const changeType = input.changeType === 'contractor_proposal' || !input.changeType ? 'contractor_proposal' : input.changeType;
    assertChangeAmountSign(changeType, total);

    const changeId = randomUUID();
    const changeNumber = await nextChangeNumber(tx, agreement.organizationId, agreement.id);
    const now = new Date();
    await insertChange(tx, {
      id: changeId,
      organizationId: agreement.organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      agreementId: agreement.id,
      changeNumber,
      changeType,
      title: input.title,
      description: input.description ?? null,
      origin: 'contractor',
      status: 'submitted',
      submittedAt: now,
      timeExtensionDays: input.timeExtensionDays ?? null,
      createdActorType: 'external',
      createdByPrincipalId: context.principalId,
    });
    await insertVersion(
      tx,
      {
        id: randomUUID(),
        organizationId: agreement.organizationId,
        changeId,
        agreementId: agreement.id,
        projectId: agreement.projectId,
        vendorId: agreement.vendorId,
        versionNo: 1,
        amount: toNumericString(total),
        currency,
        timeExtensionDays: input.timeExtensionDays ?? null,
        note: input.note ?? null,
        actorType: 'external',
        actorPrincipalId: context.principalId,
      },
      lines.map((line, index) => ({
        organizationId: agreement.organizationId,
        changeId,
        agreementId: agreement.id,
        ...line,
        sortOrder: index,
      })),
    );
    await emitDomainEvent(tx, {
      organizationId: agreement.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_CHANGE_SUBMITTED,
      entityType: 'subcontract_change',
      entityId: changeId,
      actor: externalActor(context.principalId),
      payload: {
        agreementId: agreement.id,
        vendorId: agreement.vendorId,
        changeNumber,
        changeType,
        origin: 'contractor',
        status: 'submitted',
      },
    });
    await auditExternal(tx, context, agreement.organizationId, AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_SUBMITTED, changeId, {
      agreementId: agreement.id,
      changeNumber,
      origin: 'contractor',
    });
    return { changeId };
  });
}

/** Contractor counter-offer on an open change (append-only version). */
export async function counterContractorChange(
  context: ExternalContext,
  rawInput: ContractorCounterInput,
): Promise<{ versionNo: number }> {
  const input = parseOrThrow(contractorCounterSchema.safeParse(rawInput));
  const change = await findChange(context.db, input.organizationId, input.changeId);
  if (!change) throw new NotFoundError('Subcontract change');
  const agreement = await loadExternalAgreement(context, {
    organizationId: input.organizationId,
    projectId: change.projectId,
    agreementId: change.agreementId,
  });
  requireExternalScope(context, scopeOf(agreement), X.CHANGE_REQUEST);
  assertChangeAction(change.status, 'propose_version');
  if (change.status === 'draft') throw new NotFoundError('Subcontract change');

  return withTransaction(context.db, async (tx) => {
    const terms = await findAgreementFinancial(tx, agreement.organizationId, agreement.id);
    const currency = terms?.currency ?? 'ILS';
    const { lines, total } = await prepareVersionLines(tx, agreement.organizationId, agreement.id, currency, input);
    assertChangeAmountSign(change.changeType, total);
    const versionNo = await nextVersionNo(tx, agreement.organizationId, change.id);
    await insertVersion(
      tx,
      {
        id: randomUUID(),
        organizationId: agreement.organizationId,
        changeId: change.id,
        agreementId: agreement.id,
        projectId: agreement.projectId,
        vendorId: agreement.vendorId,
        versionNo,
        amount: toNumericString(total),
        currency,
        timeExtensionDays: input.timeExtensionDays ?? null,
        note: input.note ?? null,
        actorType: 'external',
        actorPrincipalId: context.principalId,
      },
      lines.map((line, index) => ({
        organizationId: agreement.organizationId,
        changeId: change.id,
        agreementId: agreement.id,
        ...line,
        sortOrder: index,
      })),
    );
    await emitDomainEvent(tx, {
      organizationId: agreement.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_CHANGE_VERSION_PROPOSED,
      entityType: 'subcontract_change',
      entityId: change.id,
      actor: externalActor(context.principalId),
      payload: {
        agreementId: agreement.id,
        vendorId: agreement.vendorId,
        changeNumber: change.changeNumber,
        versionNo,
        actorType: 'external',
      },
    });
    await auditExternal(
      tx,
      context,
      agreement.organizationId,
      AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_VERSION_PROPOSED,
      change.id,
      { versionNo },
    );
    return { versionNo };
  });
}
