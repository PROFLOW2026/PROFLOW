import { randomUUID } from 'node:crypto';
import { entityLinks } from '@drizzle/schema';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { addMoney, isZeroMoney, money, toNumericString } from '@/shared/money';
import {
  findAgreementFinancial,
  insertValueEvent,
  listAgreementValueEvents,
  lockAgreement,
  updateAgreementRow,
} from '../data/agreements.repository';
import {
  findChange,
  insertChange,
  insertVersion,
  listAgreementChanges as listAgreementChangeRows,
  listVersionsForChanges,
  lockChange,
  nextChangeNumber,
  nextVersionNo,
  updateChangeRow,
} from '../data/changes.repository';
import {
  insertWorkLine,
  insertWorkLineAdjustments,
  listWorkLineAdjustments,
  listWorkLinePrices,
  listWorkLinesOperational,
} from '../data/work-lines.repository';
import { assertAgreementAcceptsChanges, assertChangeAction } from '../domain/lifecycle';
import type {
  AgreementOperationalView,
  ChangeView,
  SubcontractChangeOrigin,
  SubcontractChangeType,
  SubcontractLineType,
} from '../domain/types';
import {
  addDaysToBusinessDate,
  approvedContractValue,
  assertChangeAmountSign,
  assertNotBelowZero,
  revisedLineValue,
  versionLineAmount,
  versionTotal,
} from '../domain/value';
import {
  changeDecisionSchema,
  createChangeFromInstructionSchema,
  createChangeSchema,
  proposeVersionSchema,
  type ChangeDecisionInput,
  type CreateChangeFromInstructionInput,
  type CreateChangeInput,
  type ProposeVersionInput,
} from '../validation/schemas';
import { loadAgreementWithAccess, parseOrThrow, requireAccess, requireAnyAccess } from './access';

const E = DOMAIN_EVENTS;

export interface NormalizedVersionLine {
  readonly workLineId: string | null;
  readonly newLineCode: string | null;
  readonly newLineDescription: string | null;
  readonly newLineUnit: string | null;
  readonly newLineType: SubcontractLineType | null;
  readonly quantityDelta: string;
  readonly unitRate: string | null;
  readonly amountDelta: string;
}

/** Validates version lines against the agreement and computes the version total (pure + one read). */
export async function prepareVersionLines(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
  currency: string,
  input: { amount?: string | null; lines: readonly {
    workLineId?: string | null;
    newLineCode?: string | null;
    newLineDescription?: string | null;
    newLineUnit?: string | null;
    newLineType?: SubcontractLineType | null;
    quantityDelta?: string | null;
    unitRate?: string | null;
    amountDelta?: string | null;
  }[] },
) {
  const known = new Set(
    (await listWorkLinesOperational(db, organizationId, agreementId))
      .filter((line) => line.status === 'active')
      .map((line) => line.id),
  );
  const lines: NormalizedVersionLine[] = input.lines.map((line, index) => {
    if (line.workLineId && !known.has(line.workLineId)) {
      throw new ValidationError([{ path: `lines.${index}.workLineId`, message: 'subcontracts.validation.lineNotInAgreement' }]);
    }
    const quantityDelta = line.quantityDelta ?? '0';
    const amount = versionLineAmount(
      { quantityDelta, unitRate: line.unitRate ?? null, amountDelta: line.amountDelta ?? null },
      currency,
    );
    if (!line.workLineId && (quantityDelta.startsWith('-') || amount.amount.startsWith('-'))) {
      throw new ValidationError([{ path: `lines.${index}.amountDelta`, message: 'subcontracts.validation.newLineNegative' }]);
    }
    return {
      workLineId: line.workLineId ?? null,
      newLineCode: line.workLineId ? null : (line.newLineCode ?? null),
      newLineDescription: line.workLineId ? null : (line.newLineDescription ?? null),
      newLineUnit: line.workLineId ? null : (line.newLineUnit ?? null),
      newLineType: line.workLineId ? null : (line.newLineType ?? 'lump_sum'),
      quantityDelta,
      unitRate: line.unitRate ?? null,
      amountDelta: toNumericString(amount),
    };
  });
  const total = versionTotal({ currency, amount: input.amount ?? null, lines });
  return { lines, total };
}

interface InsertChangeArgs {
  readonly agreement: AgreementOperationalView;
  readonly changeType: SubcontractChangeType;
  readonly title: string;
  readonly description: string | null;
  readonly origin: SubcontractChangeOrigin;
  readonly timeExtensionDays: number | null;
  readonly source: { type: string; id: string } | null;
}

/** Internal change header insert (inside the caller's transaction). */
export async function insertInternalChange(context: OrgContext, tx: DbExecutor, args: InsertChangeArgs): Promise<string> {
  const id = randomUUID();
  const changeNumber = await nextChangeNumber(tx, context.organizationId, args.agreement.id);
  await insertChange(tx, {
    id,
    organizationId: context.organizationId,
    projectId: args.agreement.projectId,
    vendorId: args.agreement.vendorId,
    agreementId: args.agreement.id,
    changeNumber,
    changeType: args.changeType,
    title: args.title,
    description: args.description,
    origin: args.origin,
    sourceEntityType: args.source?.type ?? null,
    sourceEntityId: args.source?.id ?? null,
    status: 'draft',
    timeExtensionDays: args.timeExtensionDays,
    createdActorType: 'internal',
    createdByUserId: context.userId,
  });
  if (args.source) {
    await tx
      .insert(entityLinks)
      .values({
        organizationId: context.organizationId,
        projectId: args.agreement.projectId,
        sourceType: args.source.type,
        sourceId: args.source.id,
        targetType: 'subcontract_change',
        targetId: id,
        relation: 'converted_to',
        actorType: 'internal',
        actorUserId: context.userId,
      })
      .onConflictDoNothing();
  }
  await emitDomainEvent(tx, {
    organizationId: context.organizationId,
    projectId: args.agreement.projectId,
    type: E.SUBCONTRACT_CHANGE_CREATED,
    entityType: 'subcontract_change',
    entityId: id,
    actor: internalActor(context.userId),
    payload: {
      agreementId: args.agreement.id,
      vendorId: args.agreement.vendorId,
      changeNumber,
      changeType: args.changeType,
      origin: args.origin,
      source: args.source?.type ?? null,
    },
  });
  await recordAuditEvent(
    { ...context, db: tx },
    {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_CREATED,
      entityType: 'subcontract_change',
      entityId: id,
      after: { agreementId: args.agreement.id, changeNumber, changeType: args.changeType, origin: args.origin },
    },
  );
  return id;
}

/** Raise a change (draft, no money). Site coordination may raise; pricing needs change.financial.manage. */
export async function createChange(context: OrgContext, rawInput: CreateChangeInput): Promise<{ changeId: string }> {
  const input = parseOrThrow(createChangeSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAnyAccess(access, ['canCoordinate', 'canManageContract', 'canManageChangeFinancial']);
  assertAgreementAcceptsChanges(agreement.status);
  if (input.changeType === 'contractor_proposal') {
    throw new ValidationError([{ path: 'changeType', message: 'subcontracts.validation.contractorProposalExternal' }]);
  }
  const changeId = await withTransaction(context.db, (tx) =>
    insertInternalChange(context, tx, {
      agreement,
      changeType: input.changeType,
      title: input.title,
      description: input.description ?? null,
      origin: 'internal',
      timeExtensionDays: input.timeExtensionDays ?? null,
      source: input.source ?? null,
    }),
  );
  return { changeId };
}

/**
 * Turns a potentially-financial site instruction into a draft change (exported for Track O).
 * Stores the source link; never prices or approves anything.
 */
export async function createChangeFromInstruction(
  context: OrgContext,
  rawInput: CreateChangeFromInstructionInput,
): Promise<{ changeId: string }> {
  const input = parseOrThrow(createChangeFromInstructionSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAnyAccess(access, ['canCoordinate', 'canManageContract', 'canManageChangeFinancial']);
  assertAgreementAcceptsChanges(agreement.status);
  const changeId = await withTransaction(context.db, (tx) =>
    insertInternalChange(context, tx, {
      agreement,
      changeType: input.changeType === 'contractor_proposal' ? 'instruction' : input.changeType,
      title: input.title,
      description: input.description ?? null,
      origin: 'site_instruction',
      timeExtensionDays: null,
      source: { type: input.sourceEntityType, id: input.instructionId },
    }),
  );
  return { changeId };
}

async function loadChangeWithAccess(context: OrgContext, changeId: string) {
  const change = await findChange(context.db, context.organizationId, changeId);
  if (!change) throw new NotFoundError('Subcontract change');
  const { agreement, access } = await loadAgreementWithAccess(context, change.agreementId);
  return { change, agreement, access };
}

export async function submitChange(context: OrgContext, input: { changeId: string }): Promise<void> {
  const { change, agreement, access } = await loadChangeWithAccess(context, input.changeId);
  requireAnyAccess(access, ['canCoordinate', 'canManageContract', 'canManageChangeFinancial']);
  assertChangeAction(change.status, 'submit');
  assertAgreementAcceptsChanges(agreement.status);
  await withTransaction(context.db, async (tx) => {
    const updated = await updateChangeRow(
      tx,
      context.organizationId,
      change.id,
      { status: 'submitted', submittedAt: new Date() },
      ['draft'],
    );
    if (!updated) throw new ConflictError('Change was updated concurrently');
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_CHANGE_SUBMITTED,
      entityType: 'subcontract_change',
      entityId: change.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, changeNumber: change.changeNumber, status: 'submitted' },
    });
    await recordAuditEvent(
      { ...context, db: tx },
      {
        action: AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_SUBMITTED,
        entityType: 'subcontract_change',
        entityId: change.id,
        before: { status: change.status },
        after: { status: 'submitted' },
      },
    );
  });
}

/** Appends a priced negotiation version (append-only). Never touches the contract value. */
export async function proposeChangeVersion(
  context: OrgContext,
  rawInput: ProposeVersionInput,
): Promise<{ versionId: string; versionNo: number }> {
  const input = parseOrThrow(proposeVersionSchema.safeParse(rawInput));
  const { change, agreement, access } = await loadChangeWithAccess(context, input.changeId);
  requireAccess(access, 'canManageChangeFinancial');
  assertChangeAction(change.status, 'propose_version');

  return withTransaction(context.db, async (tx) => {
    const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
    if (!financial) throw new NotFoundError('Subcontract agreement');
    const { lines, total } = await prepareVersionLines(tx, context.organizationId, agreement.id, financial.currency, input);
    assertChangeAmountSign(change.changeType, total);
    const versionNo = await nextVersionNo(tx, context.organizationId, change.id);
    const versionId = randomUUID();
    await insertVersion(
      tx,
      {
        id: versionId,
        organizationId: context.organizationId,
        changeId: change.id,
        agreementId: agreement.id,
        projectId: agreement.projectId,
        vendorId: agreement.vendorId,
        versionNo,
        amount: toNumericString(total),
        currency: financial.currency,
        timeExtensionDays: input.timeExtensionDays ?? change.timeExtensionDays ?? null,
        note: input.note ?? null,
        actorType: 'internal',
        actorUserId: context.userId,
      },
      lines.map((line, index) => ({
        organizationId: context.organizationId,
        changeId: change.id,
        agreementId: agreement.id,
        ...line,
        sortOrder: index,
      })),
    );
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_CHANGE_VERSION_PROPOSED,
      entityType: 'subcontract_change',
      entityId: change.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, changeNumber: change.changeNumber, versionNo, actorType: 'internal' },
    });
    await recordAuditEvent(
      { ...context, db: tx },
      {
        action: AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_VERSION_PROPOSED,
        entityType: 'subcontract_change',
        entityId: change.id,
        after: { versionNo, amount: toNumericString(total), lines: lines.length },
      },
    );
    return { versionId, versionNo };
  });
}

/**
 * Approves a change version: appends a `change_order` value event (current value moves only here),
 * appends line adjustments / creates change-origin lines, applies a time extension. Final.
 */
export async function approveChange(context: OrgContext, rawInput: ChangeDecisionInput): Promise<void> {
  const input = parseOrThrow(changeDecisionSchema.safeParse(rawInput));
  const { agreement, access } = await loadChangeWithAccess(context, input.changeId);
  requireAccess(access, 'canManageChangeFinancial');

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const change = await lockChange(tx, context.organizationId, input.changeId);
    if (!change) throw new NotFoundError('Subcontract change');
    assertChangeAction(change.status, 'approve');
    const locked = await lockAgreement(tx, context.organizationId, agreement.id);
    if (!locked) throw new NotFoundError('Subcontract agreement');
    assertAgreementAcceptsChanges(locked.status);

    const versions = (await listVersionsForChanges(tx, context.organizationId, [change.id])).get(change.id) ?? [];
    if (versions.length === 0) {
      throw new DomainRuleError('Price the change before approving it', 'subcontracts.errors.changeNotPriced');
    }
    const version = input.versionId
      ? versions.find((candidate) => candidate.id === input.versionId)
      : versions[versions.length - 1];
    if (!version) throw new NotFoundError('Change version');

    const currency = locked.currency;
    const total = money(version.amount, currency);
    assertChangeAmountSign(change.changeType, total);

    const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
    const events = await listAgreementValueEvents(tx, context.organizationId, agreement.id);
    const value = approvedContractValue({
      currency,
      draftOriginalAmount: financial?.originalAmount ?? '0',
      events,
    });
    assertNotBelowZero(addMoney(value.current, total), 'subcontracts.errors.contractBelowZero');

    const existingLineDeltas = version.lines.filter((line) => line.workLineId);
    if (existingLineDeltas.length > 0) {
      const [prices, adjustments, operational] = await Promise.all([
        listWorkLinePrices(tx, context.organizationId, agreement.id),
        listWorkLineAdjustments(tx, context.organizationId, agreement.id),
        listWorkLinesOperational(tx, context.organizationId, agreement.id),
      ]);
      const priceByLine = new Map(prices.map((price) => [price.workLineId, price]));
      const lineById = new Map(operational.map((line) => [line.id, line]));
      for (const delta of existingLineDeltas) {
        const line = lineById.get(delta.workLineId!);
        if (!line || line.status !== 'active') {
          throw new DomainRuleError('A changed line is no longer active', 'subcontracts.errors.lineNotActive');
        }
        const revised = revisedLineValue({
          currency,
          isBaseline: line.isBaseline,
          baselineAmount: priceByLine.get(line.id)?.contractAmount ?? '0',
          baselineQuantity: line.quantity,
          adjustments: [
            ...adjustments.filter((adjustment) => adjustment.workLineId === line.id),
            { quantityDelta: delta.quantityDelta, amountDelta: delta.amountDelta },
          ],
        });
        assertNotBelowZero(revised.revised);
      }
    }

    let valueEventId: string | null = null;
    if (!isZeroMoney(total)) {
      valueEventId = await insertValueEvent(tx, {
        organizationId: context.organizationId,
        subcontractId: agreement.id,
        kind: 'change_order',
        amount: toNumericString(total),
        currency,
        effectiveDate: todayInTimeZone(context.organization.timezone),
        reason: `Change #${change.changeNumber}: ${change.title}`.slice(0, 500),
        actorUserId: context.userId,
      });
    }

    const adjustmentRows = [];
    for (const line of version.lines) {
      if (line.workLineId) {
        adjustmentRows.push({
          organizationId: context.organizationId,
          agreementId: agreement.id,
          projectId: agreement.projectId,
          vendorId: agreement.vendorId,
          workLineId: line.workLineId,
          changeId: change.id,
          versionLineId: line.id,
          quantityDelta: line.quantityDelta,
          amountDelta: line.amountDelta,
          unitRate: line.unitRate,
          currency,
          actorUserId: context.userId,
        });
        continue;
      }
      const lineType = (line.newLineType ?? 'lump_sum') as SubcontractLineType;
      try {
        await insertWorkLine(
          tx,
          {
            organizationId: context.organizationId,
            agreementId: agreement.id,
            projectId: agreement.projectId,
            vendorId: agreement.vendorId,
            code: line.newLineCode,
            description: line.newLineDescription!,
            unit: line.newLineUnit ?? 'unit',
            quantity: line.quantityDelta.startsWith('-') ? '0' : line.quantityDelta,
            sortOrder: 10_000 + change.changeNumber,
            createdByUserId: context.userId,
          },
          {
            organizationId: context.organizationId,
            agreementId: agreement.id,
            projectId: agreement.projectId,
            vendorId: agreement.vendorId,
            lineType,
            isBaseline: false,
            originChangeId: change.id,
          },
          {
            organizationId: context.organizationId,
            currency,
            unitPrice: line.unitRate ?? '0',
            contractAmount: line.amountDelta,
          },
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictError('Line code already used', 'subcontracts.errors.lineCodeTaken');
        }
        throw error;
      }
    }
    await insertWorkLineAdjustments(tx, adjustmentRows);

    const extensionDays = version.timeExtensionDays ?? 0;
    if (extensionDays > 0 && locked.endDate) {
      await updateAgreementRow(tx, context.organizationId, agreement.id, {
        endDate: addDaysToBusinessDate(locked.endDate, extensionDays),
      });
    }

    const updated = await updateChangeRow(
      tx,
      context.organizationId,
      change.id,
      {
        status: 'approved',
        approvedVersionId: version.id,
        valueEventId,
        decidedAt: new Date(),
        decisionActorType: 'internal',
        decisionUserId: context.userId,
        decisionReason: input.reason ?? null,
        timeExtensionDays: version.timeExtensionDays ?? change.timeExtensionDays,
      },
      ['submitted', 'under_negotiation'],
    );
    if (!updated) throw new ConflictError('Change was updated concurrently');

    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_CHANGE_APPROVED,
      entityType: 'subcontract_change',
      entityId: change.id,
      actor: internalActor(context.userId),
      payload: {
        agreementId: agreement.id,
        vendorId: agreement.vendorId,
        changeNumber: change.changeNumber,
        versionNo: version.versionNo,
        status: 'approved',
      },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_APPROVED,
      entityType: 'subcontract_change',
      entityId: change.id,
      before: { status: change.status },
      after: { status: 'approved', versionNo: version.versionNo, amount: toNumericString(total), valueEventId },
    });
  });
}

async function closeChange(
  context: OrgContext,
  rawInput: ChangeDecisionInput,
  target: 'rejected' | 'withdrawn',
): Promise<void> {
  const input = parseOrThrow(changeDecisionSchema.safeParse(rawInput));
  const { change, agreement, access } = await loadChangeWithAccess(context, input.changeId);
  if (target === 'rejected') {
    requireAccess(access, 'canManageChangeFinancial');
    assertChangeAction(change.status, 'reject');
    if (!input.reason) throw new ValidationError([{ path: 'reason', message: 'subcontracts.validation.reasonRequired' }]);
  } else {
    requireAnyAccess(access, ['canCoordinate', 'canManageContract', 'canManageChangeFinancial']);
    assertChangeAction(change.status, 'withdraw');
    if (change.createdActorType === 'external') {
      throw new DomainRuleError('A contractor proposal is rejected, not withdrawn', 'subcontracts.errors.cannotWithdrawExternal');
    }
  }
  await withTransaction(context.db, async (tx) => {
    const updated = await updateChangeRow(
      tx,
      context.organizationId,
      change.id,
      {
        status: target,
        decidedAt: new Date(),
        decisionActorType: 'internal',
        decisionUserId: context.userId,
        decisionReason: input.reason ?? null,
      },
      target === 'rejected' ? ['submitted', 'under_negotiation'] : ['draft', 'submitted', 'under_negotiation'],
    );
    if (!updated) throw new ConflictError('Change was updated concurrently');
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: target === 'rejected' ? E.SUBCONTRACT_CHANGE_REJECTED : E.SUBCONTRACT_CHANGE_WITHDRAWN,
      entityType: 'subcontract_change',
      entityId: change.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, changeNumber: change.changeNumber, status: target },
    });
    await recordAuditEvent(
      { ...context, db: tx },
      {
        action:
          target === 'rejected'
            ? AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_REJECTED
            : AUDIT_ACTIONS.DG_SUBCONTRACT_CHANGE_WITHDRAWN,
        entityType: 'subcontract_change',
        entityId: change.id,
        before: { status: change.status },
        after: { status: target, reason: input.reason ?? null },
      },
    );
  });
}

export function rejectChange(context: OrgContext, input: ChangeDecisionInput): Promise<void> {
  return closeChange(context, input, 'rejected');
}

export function withdrawChange(context: OrgContext, input: ChangeDecisionInput): Promise<void> {
  return closeChange(context, input, 'withdrawn');
}

/** Changes of an agreement. Versions (money) only for contract.financial.view holders. */
export async function listAgreementChanges(
  context: OrgContext,
  agreementId: string,
): Promise<{ agreement: AgreementOperationalView; changes: ChangeView[] }> {
  const { agreement, access } = await loadAgreementWithAccess(context, agreementId);
  const rows = await listAgreementChangeRows(context.db, context.organizationId, agreement.id);
  if (!access.canViewFinancial) {
    return { agreement, changes: rows.map(({ approvedVersionId: _approved, ...row }) => row) };
  }
  const versions = await listVersionsForChanges(
    context.db,
    context.organizationId,
    rows.map((row) => row.id),
  );
  return {
    agreement,
    changes: rows.map((row) => ({ ...row, versions: versions.get(row.id) ?? [] })),
  };
}
