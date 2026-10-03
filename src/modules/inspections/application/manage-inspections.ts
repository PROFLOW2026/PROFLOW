import { randomUUID } from 'node:crypto';
import { createLinkedTask } from '@/modules/collaboration';
import { createDefect } from '@/modules/defects/application/manage-defects';
import { resolveQualityRefs } from '@/modules/defects';
import { addDaysIso, defaultDueInDays } from '@/modules/defects/domain/lifecycle';
import { parseOrThrow } from '@/modules/defects/validation/schemas';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  findCustomTemplate,
  findInspectionRow,
  insertInspectionItems,
  insertInspectionRow,
  insertOutcomeRow,
  listItemRows,
  maxInspectionReference,
  resetItemResults,
  updateInspectionRow,
  updateItemResults,
  type InspectionRow,
} from '../data/inspections.repository';
import { findCatalogTemplate } from '../domain/catalog';
import {
  canEditChecklist,
  canPerformInspectionAction,
  tallyChecklist,
  validateOutcome,
  type InspectionAction,
} from '../domain/rules';
import {
  checklistResultsSchema,
  createInspectionSchema,
  recordOutcomeSchema,
  reinspectSchema,
  updateInspectionSchema,
  type ChecklistResultsInput,
  type CreateInspectionInput,
  type RecordOutcomeInput,
  type ReinspectInput,
  type UpdateInspectionInput,
} from '../validation/schemas';

const C = PROJECT_CAPABILITIES;

async function loadInspection(context: OrgContext, inspectionId: string): Promise<InspectionRow> {
  const row = await findInspectionRow(context.db, context.organizationId, inspectionId);
  if (!row) throw new NotFoundError('inspection');
  return row;
}

function requireAction(action: InspectionAction, row: InspectionRow): void {
  if (!canPerformInspectionAction(action, row.status, row.outcome)) {
    throw new DomainRuleError(
      `Inspection action ${action} not allowed from ${row.status}`,
      'inspections.errors.invalidTransition',
      { action, status: row.status },
    );
  }
}

async function casUpdate(
  context: OrgContext,
  row: InspectionRow,
  patch: Parameters<typeof updateInspectionRow>[4],
): Promise<void> {
  const ok = await updateInspectionRow(context.db, context.organizationId, row.id, row.status, patch);
  if (!ok) throw new ConflictError('Inspection changed concurrently', 'inspections.errors.concurrentChange');
}

function eventPayload(row: InspectionRow, extra: Record<string, unknown> = {}) {
  return {
    inspectionId: row.id,
    referenceNo: row.referenceNo,
    category: row.category,
    templateKey: row.templateKey,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    locationId: row.locationId,
    ...extra,
  };
}

export async function createInspection(
  context: OrgContext,
  raw: CreateInspectionInput,
): Promise<{ inspectionId: string; referenceNo: number }> {
  const input = parseOrThrow(createInspectionSchema, raw);
  await assertProjectCapability(context, input.projectId, C.QUALITY_MANAGE);
  const refs = await resolveQualityRefs(context.db, context.organizationId, input.projectId, input);

  let templateKey: string | null = null;
  let templateId: string | null = null;
  let category = input.category ?? 'general';
  const items: { itemKey: string | null; label: string; isRequired: boolean }[] = [];
  if (input.templateRef?.startsWith('catalog:')) {
    const template = findCatalogTemplate(input.templateRef.slice('catalog:'.length));
    if (!template) throw new ValidationError([{ path: 'templateRef', message: 'Unknown template' }]);
    templateKey = template.key;
    category = input.category ?? template.category;
    for (const item of template.items) items.push({ itemKey: item.key, label: item.label, isRequired: item.required });
  } else if (input.templateRef?.startsWith('custom:')) {
    const template = await findCustomTemplate(
      context.db,
      context.organizationId,
      input.templateRef.slice('custom:'.length),
    );
    if (!template || (template.projectId && template.projectId !== input.projectId)) {
      throw new ValidationError([{ path: 'templateRef', message: 'Unknown template' }]);
    }
    templateId = template.id;
    category = input.category ?? template.category;
    for (const item of template.items) items.push({ itemKey: null, label: item.label, isRequired: item.isRequired });
  }
  for (const label of input.extraItems) items.push({ itemKey: null, label, isRequired: true });

  const referenceNo = (await maxInspectionReference(context.db, context.organizationId, input.projectId)) + 1;
  const inspectionId = randomUUID();
  await insertInspectionRow(context.db, {
    id: inspectionId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    referenceNo,
    title: input.title,
    category,
    templateKey,
    templateId,
    status: 'scheduled',
    locationId: refs.locationId,
    vendorId: refs.vendorId,
    subcontractAgreementId: refs.subcontractAgreementId,
    workLineId: refs.workLineId,
    workPackageId: refs.workPackageId,
    milestoneId: refs.milestoneId,
    scheduledFor: input.scheduledFor ?? null,
    inspectorUserId: input.inspectorUserId ?? context.userId,
    contractorVisible: input.contractorVisible,
    createdByUserId: context.userId,
  });
  await insertInspectionItems(
    context.db,
    items.map((item, index) => ({
      organizationId: context.organizationId,
      inspectionId,
      sortOrder: index,
      itemKey: item.itemKey,
      label: item.label,
      isRequired: item.isRequired,
    })),
  );
  const created = await loadInspection(context, inspectionId);
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.QUALITY_INSPECTION_SCHEDULED,
    entityType: 'inspection',
    entityId: inspectionId,
    actor: internalActor(context.userId),
    payload: eventPayload(created, { scheduledFor: created.scheduledFor, reinspection: false }),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_INSPECTION_CREATED,
    entityType: 'quality_inspection',
    entityId: inspectionId,
    after: { referenceNo, title: input.title, category, templateKey, itemCount: items.length },
    metadata: { projectId: input.projectId },
  });
  return { inspectionId, referenceNo };
}

export async function updateInspection(
  context: OrgContext,
  inspectionId: string,
  raw: UpdateInspectionInput,
): Promise<void> {
  const input = parseOrThrow(updateInspectionSchema, raw);
  const row = await loadInspection(context, inspectionId);
  await assertProjectCapability(context, row.projectId, C.QUALITY_MANAGE);
  requireAction('edit', row);
  const refs = await resolveQualityRefs(context.db, context.organizationId, row.projectId, {
    locationId: input.locationId !== undefined ? input.locationId : row.locationId,
    vendorId: input.vendorId !== undefined ? input.vendorId : row.vendorId,
    subcontractAgreementId:
      input.subcontractAgreementId !== undefined ? input.subcontractAgreementId : row.subcontractAgreementId,
    workLineId: input.workLineId !== undefined ? input.workLineId : row.workLineId,
    workPackageId: input.workPackageId !== undefined ? input.workPackageId : row.workPackageId,
    milestoneId: input.milestoneId !== undefined ? input.milestoneId : row.milestoneId,
  });
  const patch = {
    title: input.title ?? row.title,
    scheduledFor: input.scheduledFor !== undefined ? (input.scheduledFor ?? null) : row.scheduledFor,
    inspectorUserId: input.inspectorUserId !== undefined ? (input.inspectorUserId ?? null) : row.inspectorUserId,
    contractorVisible: input.contractorVisible ?? row.contractorVisible,
    ...refs,
  };
  await casUpdate(context, row, patch);
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_INSPECTION_UPDATED,
    entityType: 'quality_inspection',
    entityId: inspectionId,
    before: {
      title: row.title,
      scheduledFor: row.scheduledFor,
      vendorId: row.vendorId,
      locationId: row.locationId,
      inspectorUserId: row.inspectorUserId,
    },
    after: {
      title: patch.title,
      scheduledFor: patch.scheduledFor,
      vendorId: patch.vendorId,
      locationId: patch.locationId,
      inspectorUserId: patch.inspectorUserId,
    },
  });
}

export async function startInspection(context: OrgContext, inspectionId: string): Promise<void> {
  const row = await loadInspection(context, inspectionId);
  await assertProjectCapability(context, row.projectId, C.QUALITY_MANAGE);
  requireAction('start', row);
  await casUpdate(context, row, { status: 'in_progress', startedAt: new Date() });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_INSPECTION_STARTED,
    entityType: 'quality_inspection',
    entityId: inspectionId,
    before: { status: row.status },
    after: { status: 'in_progress' },
  });
}

/** Saves checklist results; a scheduled inspection moves to in_progress on the first save. */
export async function saveChecklistResults(
  context: OrgContext,
  inspectionId: string,
  raw: ChecklistResultsInput,
): Promise<void> {
  const results = parseOrThrow(checklistResultsSchema, raw);
  const row = await loadInspection(context, inspectionId);
  await assertProjectCapability(context, row.projectId, C.QUALITY_MANAGE);
  if (!canEditChecklist(row.status)) {
    throw new DomainRuleError('Checklist is locked', 'inspections.errors.checklistLocked');
  }
  const updated = await updateItemResults(context.db, context.organizationId, inspectionId, context.userId, results);
  if (updated !== results.length) throw new ValidationError([{ path: 'results', message: 'Unknown checklist item' }]);
  if (row.status === 'scheduled' && results.length > 0) {
    await casUpdate(context, row, { status: 'in_progress', startedAt: new Date() });
  }
}

export interface RecordOutcomeOptions {
  /** Localized title for defects opened from failed items (server action translates catalog keys). */
  readonly labelFor?: (item: { readonly itemKey: string | null; readonly label: string }) => string;
}

export interface RecordOutcomeResult {
  readonly attemptNo: number;
  readonly defectIds: readonly string[];
  readonly taskId: string | null;
}

export async function recordInspectionOutcome(
  context: OrgContext,
  inspectionId: string,
  raw: RecordOutcomeInput,
  options: RecordOutcomeOptions = {},
): Promise<RecordOutcomeResult> {
  const input = parseOrThrow(recordOutcomeSchema, raw);
  const row = await loadInspection(context, inspectionId);
  await assertProjectCapability(context, row.projectId, C.QUALITY_MANAGE);
  requireAction('record_outcome', row);

  if (input.results.length > 0) {
    const updated = await updateItemResults(
      context.db,
      context.organizationId,
      inspectionId,
      context.userId,
      input.results,
    );
    if (updated !== input.results.length) {
      throw new ValidationError([{ path: 'results', message: 'Unknown checklist item' }]);
    }
  }
  const items = await listItemRows(context.db, context.organizationId, inspectionId);
  const tally = tallyChecklist(items);
  const violation = validateOutcome(input.outcome, tally, input);
  if (violation) {
    throw new DomainRuleError(`Outcome rejected: ${violation}`, `inspections.errors.${violation}`);
  }

  const attemptNo = row.attemptNo + 1;
  const now = new Date();
  await casUpdate(context, row, {
    status: 'completed',
    outcome: input.outcome,
    attemptNo,
    completedAt: now,
    startedAt: row.startedAt ?? now,
    summary: input.summary,
    conditions: input.outcome === 'conditional_pass' ? input.conditions : null,
  });
  const actor = internalActor(context.userId);
  await insertOutcomeRow(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    inspectionId,
    attemptNo,
    outcome: input.outcome,
    summary: input.summary,
    conditions: input.outcome === 'conditional_pass' ? input.conditions : null,
    passCount: tally.pass,
    failCount: tally.fail,
    naCount: tally.na,
    checklist: items.map((item) => ({
      itemId: item.id,
      itemKey: item.itemKey,
      label: item.label,
      result: item.result,
      note: item.note,
    })),
    actorType: 'internal',
    actorUserId: context.userId,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: input.outcome === 'fail' ? DOMAIN_EVENTS.QUALITY_INSPECTION_FAILED : DOMAIN_EVENTS.QUALITY_INSPECTION_COMPLETED,
    entityType: 'inspection',
    entityId: inspectionId,
    actor,
    payload: eventPayload(row, { outcome: input.outcome, attemptNo, failCount: tally.fail }),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_INSPECTION_OUTCOME_RECORDED,
    entityType: 'quality_inspection',
    entityId: inspectionId,
    before: { status: row.status, outcome: row.outcome, attemptNo: row.attemptNo },
    after: { status: 'completed', outcome: input.outcome, attemptNo, pass: tally.pass, fail: tally.fail, na: tally.na },
  });

  const defectIds: string[] = [];
  let taskId: string | null = null;
  if (input.outcome !== 'pass') {
    const followUp = input.followUp;
    if (followUp.createDefects) {
      const dueDate =
        followUp.defectDueDate ??
        addDaysIso(todayInTimeZone(context.organization.timezone), defaultDueInDays(followUp.defectSeverity));
      const failed = items.filter((item) => item.result === 'fail');
      const sources =
        failed.length > 0
          ? failed.map((item) => ({
              itemId: item.id as string | null,
              title: options.labelFor ? options.labelFor(item) : item.label,
              description: item.note,
            }))
          : [{ itemId: null, title: row.title, description: input.summary }];
      for (const source of sources) {
        const created = await createDefect(
          context,
          {
            projectId: row.projectId,
            title: source.title,
            description: source.description,
            severity: followUp.defectSeverity,
            dueDate,
            locationId: row.locationId,
            vendorId: row.vendorId,
            subcontractAgreementId: row.subcontractAgreementId,
            workLineId: row.workLineId,
            inspectorUserId: row.inspectorUserId ?? context.userId,
            contractorVisible: row.contractorVisible,
            sourceInspectionId: row.id,
            sourceInspectionItemId: source.itemId,
          },
          { fromInspection: true },
        );
        defectIds.push(created.defectId);
      }
    }
    if (followUp.createTask) {
      const result = await createLinkedTask(context, {
        projectId: row.projectId,
        title: followUp.taskTitle ?? row.title,
        description: input.summary,
        dueDate: followUp.taskDueDate ?? null,
        priority: input.outcome === 'fail' ? 'high' : 'medium',
        assignee: row.vendorId
          ? { kind: 'contractor', vendorId: row.vendorId, subcontractAgreementId: row.subcontractAgreementId }
          : { kind: 'none' },
        locationId: row.locationId,
        workPackageId: row.workPackageId,
        subcontractWorkLineId: row.workLineId,
        requiresEvidence: true,
        sources: [{ entityType: 'inspection', entityId: row.id, relation: 'corrective_action' }],
      });
      taskId = result.taskId;
    }
  }
  return { attemptNo, defectIds, taskId };
}

/** Failed / conditional inspection goes back to scheduled with a fresh checklist; history is kept. */
export async function startReinspection(
  context: OrgContext,
  inspectionId: string,
  raw: ReinspectInput,
): Promise<void> {
  const input = parseOrThrow(reinspectSchema, raw);
  const row = await loadInspection(context, inspectionId);
  await assertProjectCapability(context, row.projectId, C.QUALITY_MANAGE);
  requireAction('reinspect', row);
  await casUpdate(context, row, {
    status: 'scheduled',
    scheduledFor: input.scheduledFor ?? row.scheduledFor,
    startedAt: null,
  });
  await resetItemResults(context.db, context.organizationId, inspectionId);
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.QUALITY_INSPECTION_SCHEDULED,
    entityType: 'inspection',
    entityId: inspectionId,
    actor: internalActor(context.userId),
    payload: eventPayload(row, {
      scheduledFor: input.scheduledFor ?? row.scheduledFor,
      reinspection: true,
      attemptNo: row.attemptNo + 1,
    }),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_INSPECTION_REINSPECTION_STARTED,
    entityType: 'quality_inspection',
    entityId: inspectionId,
    before: { status: row.status, outcome: row.outcome, attemptNo: row.attemptNo },
    after: { status: 'scheduled', scheduledFor: input.scheduledFor ?? row.scheduledFor },
  });
}

export async function cancelInspection(context: OrgContext, inspectionId: string): Promise<void> {
  const row = await loadInspection(context, inspectionId);
  await assertProjectCapability(context, row.projectId, C.QUALITY_MANAGE);
  requireAction('cancel', row);
  await casUpdate(context, row, { status: 'cancelled' });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUALITY_INSPECTION_CANCELLED,
    entityType: 'quality_inspection',
    entityId: inspectionId,
    before: { status: row.status },
    after: { status: 'cancelled' },
  });
}
