import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { findAgreementFinancial, findWorkPackageInProject } from '../data/agreements.repository';
import {
  findLocationInProject,
  findWorkLine,
  insertWorkLine,
  updateWorkLineAttributes,
  updateWorkLineRow,
  upsertWorkLinePrice,
} from '../data/work-lines.repository';
import { areLineOperationalDetailsEditable, assertBaselineEditable, isBaselineEditable } from '../domain/lifecycle';
import type { SubcontractLineType } from '../domain/types';
import { computeLineContractAmount } from '../domain/value';
import {
  updateWorkLineSchema,
  workLineSchema,
  type UpdateWorkLineInput,
  type WorkLineInput,
} from '../validation/schemas';
import { isUniqueViolation, loadAgreementWithAccess, parseOrThrow, requireAccess, requireAnyAccess } from './access';
import { syncDraftOriginalFromLines } from './agreements';

const E = DOMAIN_EVENTS;

async function assertLineRefs(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  refs: { locationId?: string | null; workPackageId?: string | null },
): Promise<void> {
  if (refs.locationId && !(await findLocationInProject(db, organizationId, projectId, refs.locationId))) {
    throw new ValidationError([{ path: 'locationId', message: 'subcontracts.validation.locationProject' }]);
  }
  if (refs.workPackageId && !(await findWorkPackageInProject(db, organizationId, projectId, refs.workPackageId))) {
    throw new ValidationError([{ path: 'workPackageId', message: 'subcontracts.validation.workPackageProject' }]);
  }
}

function linePricing(
  currency: string,
  lineType: SubcontractLineType,
  quantity: string,
  unitPrice: string | null | undefined,
  contractAmount: string | null | undefined,
) {
  const effectiveQuantity = lineType === 'quantity_rate' ? quantity : quantity === '0' ? '1' : quantity;
  const amount = computeLineContractAmount({
    currency,
    lineType,
    quantity: effectiveQuantity,
    unitPrice: unitPrice ?? '0',
    contractAmount: contractAmount ?? '0',
  });
  return {
    quantity: effectiveQuantity,
    unitPrice: toNumericString(money(unitPrice ?? (lineType === 'quantity_rate' ? '0' : amount.amount), currency)),
    contractAmount: toNumericString(amount),
  };
}

/** Adds a baseline work line (draft agreements only; contract.manage). */
export async function addWorkLine(context: OrgContext, rawInput: WorkLineInput): Promise<{ workLineId: string }> {
  const input = parseOrThrow(workLineSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAccess(access, 'canManageContract');
  assertBaselineEditable(agreement.status);
  await assertLineRefs(context.db, context.organizationId, agreement.projectId, input);

  const workLineId = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
    if (!financial) throw new NotFoundError('Subcontract agreement');
    const pricing = linePricing(
      financial.currency,
      input.lineType,
      input.quantity ?? '0',
      input.unitPrice,
      input.contractAmount,
    );
    let id: string;
    try {
      id = await insertWorkLine(
        tx,
        {
          organizationId: context.organizationId,
          agreementId: agreement.id,
          projectId: agreement.projectId,
          vendorId: agreement.vendorId,
          code: input.code ?? null,
          description: input.description,
          unit: input.unit ?? 'unit',
          quantity: pricing.quantity,
          locationId: input.locationId ?? null,
          workPackageId: input.workPackageId ?? null,
          sortOrder: input.sortOrder ?? 0,
          createdByUserId: context.userId,
        },
        {
          organizationId: context.organizationId,
          agreementId: agreement.id,
          projectId: agreement.projectId,
          vendorId: agreement.vendorId,
          lineType: input.lineType,
          weightPercent: input.weightPercent ?? null,
          plannedStart: input.plannedStart ?? null,
          plannedEnd: input.plannedEnd ?? null,
          isBaseline: true,
          notes: input.notes ?? null,
        },
        {
          organizationId: context.organizationId,
          currency: financial.currency,
          unitPrice: pricing.unitPrice,
          contractAmount: pricing.contractAmount,
        },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Line code already used', 'subcontracts.errors.lineCodeTaken');
      throw error;
    }
    await syncDraftOriginalFromLines(tx, context.organizationId, agreement.id, financial.currency);
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_WORK_LINE_ADDED,
      entityType: 'subcontract_work_line',
      entityId: id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, workLineId: id, lineType: input.lineType },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_WORK_LINE_CREATED,
      entityType: 'subcontract_work_line',
      entityId: id,
      after: { agreementId: agreement.id, description: input.description, lineType: input.lineType },
    });
    return id;
  });
  return { workLineId };
}

const BASELINE_FIELDS = ['code', 'description', 'unit', 'quantity', 'lineType', 'weightPercent', 'unitPrice', 'contractAmount'] as const;

/**
 * Draft: everything editable by contract.manage. After activation only operational details
 * (planned dates, location, work package, order, notes) by contract.manage or contractor.coordinate;
 * scope, quantity and price change only through an approved change.
 */
export async function updateWorkLine(context: OrgContext, rawInput: UpdateWorkLineInput): Promise<void> {
  const input = parseOrThrow(updateWorkLineSchema.safeParse(rawInput));
  const line = await findWorkLine(context.db, context.organizationId, input.workLineId);
  if (!line || line.archivedAt) throw new NotFoundError('Work line');
  const { agreement, access } = await loadAgreementWithAccess(context, line.agreementId);

  const touchesBaseline = BASELINE_FIELDS.some((field) => input[field] !== undefined);
  if (touchesBaseline) {
    requireAccess(access, 'canManageContract');
    assertBaselineEditable(agreement.status);
  } else {
    requireAnyAccess(access, ['canManageContract', 'canCoordinate']);
    if (!areLineOperationalDetailsEditable(agreement.status)) {
      throw new DomainRuleError('Closed agreements cannot be edited', 'subcontracts.errors.notEditable');
    }
  }
  await assertLineRefs(context.db, context.organizationId, agreement.projectId, input);

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    try {
      await updateWorkLineRow(tx, context.organizationId, line.id, {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.unit !== undefined && input.unit !== null ? { unit: input.unit } : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
        ...(input.workPackageId !== undefined ? { workPackageId: input.workPackageId } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Line code already used', 'subcontracts.errors.lineCodeTaken');
      throw error;
    }
    await updateWorkLineAttributes(tx, context.organizationId, line.id, {
      ...(input.lineType !== undefined ? { lineType: input.lineType } : {}),
      ...(input.weightPercent !== undefined ? { weightPercent: input.weightPercent } : {}),
      ...(input.plannedStart !== undefined ? { plannedStart: input.plannedStart } : {}),
      ...(input.plannedEnd !== undefined ? { plannedEnd: input.plannedEnd } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });

    if (touchesBaseline && isBaselineEditable(agreement.status)) {
      const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
      if (!financial) throw new NotFoundError('Subcontract agreement');
      const lineType = (input.lineType ?? line.lineType ?? 'quantity_rate') as SubcontractLineType;
      if (
        input.quantity !== undefined ||
        input.unitPrice !== undefined ||
        input.contractAmount !== undefined ||
        input.lineType !== undefined
      ) {
        const pricing = linePricing(
          financial.currency,
          lineType,
          input.quantity ?? line.quantity,
          input.unitPrice,
          input.contractAmount,
        );
        await updateWorkLineRow(tx, context.organizationId, line.id, { quantity: pricing.quantity });
        await upsertWorkLinePrice(tx, {
          workLineId: line.id,
          organizationId: context.organizationId,
          currency: financial.currency,
          unitPrice: pricing.unitPrice,
          contractAmount: pricing.contractAmount,
        });
        await syncDraftOriginalFromLines(tx, context.organizationId, agreement.id, financial.currency);
      }
    }

    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_WORK_LINE_UPDATED,
      entityType: 'subcontract_work_line',
      entityId: line.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, workLineId: line.id, baseline: touchesBaseline },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_WORK_LINE_UPDATED,
      entityType: 'subcontract_work_line',
      entityId: line.id,
      after: { ...input, unitPrice: undefined, contractAmount: undefined },
    });
  });
}

/** Removes a line from a draft (soft archive; never a hard delete). */
export async function archiveWorkLine(context: OrgContext, input: { workLineId: string }): Promise<void> {
  const line = await findWorkLine(context.db, context.organizationId, input.workLineId);
  if (!line || line.archivedAt) throw new NotFoundError('Work line');
  const { agreement, access } = await loadAgreementWithAccess(context, line.agreementId);
  requireAccess(access, 'canManageContract');
  assertBaselineEditable(agreement.status);

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    await updateWorkLineRow(tx, context.organizationId, line.id, { archivedAt: new Date(), status: 'cancelled' });
    const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
    if (financial) await syncDraftOriginalFromLines(tx, context.organizationId, agreement.id, financial.currency);
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_WORK_LINE_ARCHIVED,
      entityType: 'subcontract_work_line',
      entityId: line.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, workLineId: line.id },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_WORK_LINE_ARCHIVED,
      entityType: 'subcontract_work_line',
      entityId: line.id,
    });
  });
}
