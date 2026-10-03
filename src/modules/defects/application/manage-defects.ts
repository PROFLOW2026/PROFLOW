import { randomUUID } from 'node:crypto';
import {
  assertAnyProjectCapability,
  assertProjectCapability,
  PROJECT_CAPABILITIES,
} from '@/modules/project-team';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import {
  findDefectRow,
  insertCycleRecord,
  insertDefectRow,
  maxDefectReference,
  updateDefectRow,
  type DefectRow,
} from '../data/defects.repository';
import { resolveQualityRefs } from '../data/quality-refs.repository';
import { planDefectStep, type DefectAction, type DefectStatus } from '../domain/lifecycle';
import {
  assignDefectSchema,
  createDefectSchema,
  noteSchema,
  parseOrThrow,
  requiredNoteSchema,
  updateDefectSchema,
  verifyDefectSchema,
  type AssignDefectInput,
  type CreateDefectInput,
  type DefectNoteInput,
  type UpdateDefectInput,
  type VerifyDefectInput,
} from '../validation/schemas';

const C = PROJECT_CAPABILITIES;

/** Verification of physical completion: progress.verify, or the defects owner. */
export const DEFECT_VERIFY_CAPABILITIES = [C.PROGRESS_VERIFY, C.DEFECTS_MANAGE] as const;

async function loadDefect(context: OrgContext, defectId: string): Promise<DefectRow> {
  const row = await findDefectRow(context.db, context.organizationId, defectId);
  if (!row) throw new NotFoundError('defect');
  return row;
}

function requireStep(action: DefectAction, status: DefectStatus) {
  const step = planDefectStep(action, status);
  if (!step) {
    throw new DomainRuleError(`Defect action ${action} not allowed from ${status}`, 'defects.errors.invalidTransition', {
      action,
      status,
    });
  }
  return step;
}

async function casUpdate(
  context: OrgContext,
  row: DefectRow,
  patch: Parameters<typeof updateDefectRow>[4],
): Promise<void> {
  const ok = await updateDefectRow(context.db, context.organizationId, row.id, row.status, patch);
  if (!ok) throw new ConflictError('Defect changed concurrently', 'defects.errors.concurrentChange');
}

function eventPayload(row: Pick<DefectRow, 'id' | 'referenceNo' | 'severity' | 'vendorId' | 'subcontractAgreementId' | 'mode'>, extra: Record<string, unknown> = {}) {
  return {
    defectId: row.id,
    referenceNo: row.referenceNo,
    severity: row.severity,
    mode: row.mode,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    ...extra,
  };
}

export interface CreateDefectOptions {
  /** Set by the inspections module: caller already holds quality.manage on the project. */
  readonly fromInspection?: boolean;
}

export async function createDefect(
  context: OrgContext,
  raw: CreateDefectInput,
  options: CreateDefectOptions = {},
): Promise<{ defectId: string; referenceNo: number }> {
  const input = parseOrThrow(createDefectSchema, raw);
  if (options.fromInspection) {
    await assertProjectCapability(context, input.projectId, C.QUALITY_MANAGE);
  } else {
    await assertAnyProjectCapability(context, input.projectId, [C.DEFECTS_MANAGE, C.QUALITY_MANAGE]);
  }
  const refs = await resolveQualityRefs(context.db, context.organizationId, input.projectId, input);
  const responsible = Boolean(refs.vendorId || input.assigneeUserId);
  const status: DefectStatus = responsible ? 'assigned' : 'open';
  const referenceNo = (await maxDefectReference(context.db, context.organizationId, input.projectId)) + 1;
  const defectId = randomUUID();
  const actor = internalActor(context.userId);

  await insertDefectRow(context.db, {
    id: defectId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    referenceNo,
    title: input.title,
    description: input.description,
    severity: input.severity,
    category: input.category ?? null,
    status,
    mode: input.mode,
    locationId: refs.locationId,
    vendorId: refs.vendorId,
    subcontractAgreementId: refs.subcontractAgreementId,
    workLineId: refs.workLineId,
    assigneeUserId: input.assigneeUserId ?? null,
    inspectorUserId: input.inspectorUserId ?? context.userId,
    dueDate: input.dueDate ?? null,
    sourceInspectionId: input.sourceInspectionId ?? null,
    sourceInspectionItemId: input.sourceInspectionItemId ?? null,
    warrantySourceType: input.warrantySource?.type ?? null,
    warrantySourceId: input.warrantySource?.id ?? null,
    contractorVisible: input.contractorVisible,
    createdActorType: 'internal',
    createdByUserId: context.userId,
  });

  const base = {
    organizationId: context.organizationId,
    projectId: input.projectId,
    defectId,
    cycleNo: 1,
    actor,
  };
  await insertCycleRecord(context.db, {
    ...base,
    kind: 'opened',
    fromStatus: null,
    toStatus: 'open',
    note: input.description,
    details: { severity: input.severity, dueDate: input.dueDate ?? null, sourceInspectionId: input.sourceInspectionId ?? null },
  });
  const created = {
    id: defectId,
    referenceNo,
    severity: input.severity,
    mode: input.mode,
    vendorId: refs.vendorId,
    subcontractAgreementId: refs.subcontractAgreementId,
  };
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_OPENED,
    entityType: 'defect',
    entityId: defectId,
    actor,
    payload: eventPayload(created, { sourceInspectionId: input.sourceInspectionId ?? null }),
  });
  if (responsible) {
    await insertCycleRecord(context.db, {
      ...base,
      kind: 'assigned',
      fromStatus: 'open',
      toStatus: 'assigned',
      details: { vendorId: refs.vendorId, assigneeUserId: input.assigneeUserId ?? null, dueDate: input.dueDate ?? null },
    });
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.DEFECT_ITEM_ASSIGNED,
      entityType: 'defect',
      entityId: defectId,
      actor,
      payload: eventPayload(created, { assigneeUserId: input.assigneeUserId ?? null, dueDate: input.dueDate ?? null }),
    });
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_CREATED,
    entityType: 'defect',
    entityId: defectId,
    after: { referenceNo, title: input.title, severity: input.severity, status, mode: input.mode },
    metadata: { projectId: input.projectId, sourceInspectionId: input.sourceInspectionId ?? null },
  });
  return { defectId, referenceNo };
}

export async function updateDefect(context: OrgContext, defectId: string, raw: UpdateDefectInput): Promise<void> {
  const input = parseOrThrow(updateDefectSchema, raw);
  const row = await loadDefect(context, defectId);
  await assertProjectCapability(context, row.projectId, C.DEFECTS_MANAGE);
  if (row.status === 'closed' || row.status === 'cancelled') {
    throw new DomainRuleError('Closed defects cannot be edited', 'defects.errors.notEditable');
  }
  if (input.locationId !== undefined) {
    await resolveQualityRefs(context.db, context.organizationId, row.projectId, { locationId: input.locationId });
  }
  const patch: Parameters<typeof updateDefectRow>[4] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.category !== undefined) patch.category = input.category ?? null;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ?? null;
  if (input.locationId !== undefined) patch.locationId = input.locationId ?? null;
  if (input.inspectorUserId !== undefined) patch.inspectorUserId = input.inspectorUserId ?? null;
  if (input.contractorVisible !== undefined) patch.contractorVisible = input.contractorVisible;
  if (Object.keys(patch).length === 0) return;
  await casUpdate(context, row, patch);
  const changed = Object.keys(patch);
  await insertCycleRecord(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    defectId,
    cycleNo: row.cycleNo,
    kind: 'updated',
    fromStatus: row.status,
    toStatus: row.status,
    internalOnly: !changed.some((key) => key === 'dueDate' || key === 'severity' || key === 'title' || key === 'description'),
    details: { changed, dueDate: patch.dueDate ?? row.dueDate, severity: patch.severity ?? row.severity },
    actor: internalActor(context.userId),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_UPDATED,
    entityType: 'defect',
    entityId: defectId,
    before: Object.fromEntries(changed.map((key) => [key, row[key as keyof DefectRow]])),
    after: patch,
  });
}

export async function assignDefect(context: OrgContext, defectId: string, raw: AssignDefectInput): Promise<void> {
  const input = parseOrThrow(assignDefectSchema, raw);
  const row = await loadDefect(context, defectId);
  await assertProjectCapability(context, row.projectId, C.DEFECTS_MANAGE);
  const step = requireStep('assign', row.status);
  const refs = await resolveQualityRefs(context.db, context.organizationId, row.projectId, {
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId,
    workLineId: input.workLineId,
  });
  const patch = {
    status: step.to,
    vendorId: refs.vendorId,
    subcontractAgreementId: refs.subcontractAgreementId,
    workLineId: refs.workLineId,
    assigneeUserId: input.assigneeUserId ?? null,
    dueDate: input.dueDate !== undefined ? (input.dueDate ?? null) : row.dueDate,
  };
  await casUpdate(context, row, patch);
  const actor = internalActor(context.userId);
  await insertCycleRecord(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    defectId,
    cycleNo: row.cycleNo,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    note: input.note,
    details: { vendorId: refs.vendorId, assigneeUserId: patch.assigneeUserId, dueDate: patch.dueDate },
    actor,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_ASSIGNED,
    entityType: 'defect',
    entityId: defectId,
    actor,
    payload: eventPayload(
      { ...row, vendorId: refs.vendorId, subcontractAgreementId: refs.subcontractAgreementId },
      { assigneeUserId: patch.assigneeUserId, dueDate: patch.dueDate, cycleNo: row.cycleNo },
    ),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_ASSIGNED,
    entityType: 'defect',
    entityId: defectId,
    before: { status: row.status, vendorId: row.vendorId, assigneeUserId: row.assigneeUserId },
    after: { status: step.to, vendorId: refs.vendorId, assigneeUserId: patch.assigneeUserId },
  });
}

/** Internal submission on behalf of the responsible party (own crews, or recorded on site). */
export async function submitDefectCompletionInternal(
  context: OrgContext,
  defectId: string,
  raw: DefectNoteInput,
): Promise<void> {
  const input = parseOrThrow(noteSchema, raw);
  const row = await loadDefect(context, defectId);
  await assertProjectCapability(context, row.projectId, C.DEFECTS_MANAGE);
  const step = requireStep('submit_completion', row.status);
  const now = new Date();
  await casUpdate(context, row, { status: step.to, lastSubmittedAt: now });
  const actor = internalActor(context.userId);
  await insertCycleRecord(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    defectId,
    cycleNo: row.cycleNo,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    note: input.note,
    actor,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_COMPLETION_SUBMITTED,
    entityType: 'defect',
    entityId: defectId,
    actor,
    payload: eventPayload(row, { cycleNo: row.cycleNo }),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_COMPLETION_SUBMITTED,
    entityType: 'defect',
    entityId: defectId,
    before: { status: row.status },
    after: { status: step.to, cycleNo: row.cycleNo },
  });
}

export async function startDefectVerification(context: OrgContext, defectId: string): Promise<void> {
  const row = await loadDefect(context, defectId);
  await assertAnyProjectCapability(context, row.projectId, DEFECT_VERIFY_CAPABILITIES);
  const step = requireStep('start_verification', row.status);
  await casUpdate(context, row, { status: step.to, inspectorUserId: context.userId });
  await insertCycleRecord(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    defectId,
    cycleNo: row.cycleNo,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    actor: internalActor(context.userId),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_VERIFICATION_STARTED,
    entityType: 'defect',
    entityId: defectId,
    before: { status: row.status },
    after: { status: step.to },
  });
}

export async function verifyDefect(context: OrgContext, defectId: string, raw: VerifyDefectInput): Promise<void> {
  const input = parseOrThrow(verifyDefectSchema, raw);
  const row = await loadDefect(context, defectId);
  await assertAnyProjectCapability(context, row.projectId, DEFECT_VERIFY_CAPABILITIES);
  const actor = internalActor(context.userId);
  const base = { organizationId: context.organizationId, projectId: row.projectId, defectId, actor };

  if (input.decision === 'accept') {
    const step = requireStep('accept', row.status);
    await casUpdate(context, row, { status: step.to, closedAt: new Date(), inspectorUserId: context.userId });
    await insertCycleRecord(context.db, {
      ...base,
      cycleNo: row.cycleNo,
      kind: step.record,
      fromStatus: row.status,
      toStatus: step.to,
      note: input.note,
    });
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: row.projectId,
      type: DOMAIN_EVENTS.DEFECT_ITEM_CLOSED,
      entityType: 'defect',
      entityId: defectId,
      actor,
      payload: eventPayload(row, { cycleNo: row.cycleNo }),
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.DEFECT_ACCEPTED,
      entityType: 'defect',
      entityId: defectId,
      before: { status: row.status },
      after: { status: step.to, cycleNo: row.cycleNo },
    });
    return;
  }

  const step = requireStep('reject', row.status);
  const nextCycle = row.cycleNo + 1;
  await casUpdate(context, row, {
    status: step.to,
    cycleNo: nextCycle,
    inspectorUserId: context.userId,
    dueDate: input.dueDate !== undefined ? (input.dueDate ?? null) : row.dueDate,
  });
  await insertCycleRecord(context.db, {
    ...base,
    cycleNo: row.cycleNo,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    note: input.note,
    details: { nextCycleNo: nextCycle, dueDate: input.dueDate ?? row.dueDate },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_REOPENED,
    entityType: 'defect',
    entityId: defectId,
    actor,
    payload: eventPayload(row, { reason: 'rejected', cycleNo: nextCycle }),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_REJECTED,
    entityType: 'defect',
    entityId: defectId,
    before: { status: row.status, cycleNo: row.cycleNo },
    after: { status: step.to, cycleNo: nextCycle },
  });
}

export async function reopenDefect(context: OrgContext, defectId: string, raw: DefectNoteInput): Promise<void> {
  const input = parseOrThrow(requiredNoteSchema, raw);
  const row = await loadDefect(context, defectId);
  await assertProjectCapability(context, row.projectId, C.DEFECTS_MANAGE);
  const step = requireStep('reopen', row.status);
  const nextCycle = row.cycleNo + 1;
  await casUpdate(context, row, {
    status: step.to,
    cycleNo: nextCycle,
    closedAt: null,
    dueDate: input.dueDate !== undefined ? (input.dueDate ?? null) : row.dueDate,
  });
  const actor = internalActor(context.userId);
  await insertCycleRecord(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    defectId,
    cycleNo: nextCycle,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    note: input.note,
    details: { previousCycleNo: row.cycleNo },
    actor,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_REOPENED,
    entityType: 'defect',
    entityId: defectId,
    actor,
    payload: eventPayload(row, { reason: 'reopened', cycleNo: nextCycle }),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_REOPENED,
    entityType: 'defect',
    entityId: defectId,
    before: { status: row.status, cycleNo: row.cycleNo },
    after: { status: step.to, cycleNo: nextCycle },
  });
}

export async function cancelDefect(context: OrgContext, defectId: string, raw: DefectNoteInput): Promise<void> {
  const input = parseOrThrow(requiredNoteSchema, raw);
  const row = await loadDefect(context, defectId);
  await assertProjectCapability(context, row.projectId, C.DEFECTS_MANAGE);
  const step = requireStep('cancel', row.status);
  await casUpdate(context, row, { status: step.to });
  const actor = internalActor(context.userId);
  await insertCycleRecord(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    defectId,
    cycleNo: row.cycleNo,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    note: input.note,
    internalOnly: true,
    actor,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_CANCELLED,
    entityType: 'defect',
    entityId: defectId,
    actor,
    payload: eventPayload(row),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DEFECT_CANCELLED,
    entityType: 'defect',
    entityId: defectId,
    before: { status: row.status },
    after: { status: step.to },
  });
}