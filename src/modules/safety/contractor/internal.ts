import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { internalActor } from '@/shared/actor';
import { todayInTimeZone } from '@/shared/dates';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError } from '@/shared/errors';
import { createLinkedTask } from '@/modules/collaboration';
import { findAgreementScope } from '@/modules/contractor-compliance';
import { PROJECT_CAPABILITIES as C, assertProjectCapability } from '@/modules/project-team';
import {
  assertSafetyActionStatusTransition,
  assertSafetyRecordStatusTransition,
  closedAtForSafetyActionStatus,
  closedAtForSafetyRecordStatus,
} from '../domain/status';
import type { SafetyActionStatus, SafetyRecordStatus } from '../domain/types';
import {
  findCorrectiveActionById,
  insertCorrectiveAction,
  insertSafetyRecord,
  listCorrectiveActionsForRecord,
  updateCorrectiveActionById,
  updateSafetyRecordById,
} from '../data/safety.repository';
import { parseOrThrow } from '../application/parse';
import {
  SAFETY_RECORD_ENTITY,
  assertCanCloseContractorSafety,
  taskPriorityForSeverity,
  type ContractorSafetyAction,
  type ContractorSafetyDetail,
  type ContractorSafetyRecord,
} from './domain';
import {
  findContractorSafetyRecord,
  insertActionTaskLink,
  insertContractorLink,
  listActionTaskLinks,
  listContractorSafetyRecords,
  updateContractorLink,
  type ContractorSafetyFilter,
} from './repository';
import {
  addContractorCorrectiveActionSchema,
  closeContractorSafetySchema,
  reportContractorSafetySchema,
  type AddContractorCorrectiveActionInput,
  type CloseContractorSafetyInput,
  type ReportContractorSafetyInput,
} from './schemas';

async function requireRecordOnProject(
  context: OrgContext,
  projectId: string,
  recordId: string,
): Promise<ContractorSafetyRecord> {
  const record = await findContractorSafetyRecord(context.db, context.organizationId, recordId);
  if (!record || record.projectId !== projectId) throw new NotFoundError('Safety record');
  return record;
}

export async function listContractorSafety(
  context: OrgContext,
  filter: ContractorSafetyFilter,
): Promise<{ readonly records: readonly ContractorSafetyRecord[]; readonly today: string }> {
  await assertProjectCapability(context, filter.projectId, C.SAFETY_MANAGE);
  const records = await listContractorSafetyRecords(context.db, context.organizationId, filter);
  return { records, today: todayInTimeZone(context.organization.timezone) as string };
}

export async function getContractorSafety(
  context: OrgContext,
  input: { readonly projectId: string; readonly safetyRecordId: string },
): Promise<ContractorSafetyDetail> {
  await assertProjectCapability(context, input.projectId, C.SAFETY_MANAGE);
  const record = await requireRecordOnProject(context, input.projectId, input.safetyRecordId);
  const [actions, taskLinks] = await Promise.all([
    listCorrectiveActionsForRecord(context.db, context.organizationId, record.id),
    listActionTaskLinks(context.db, context.organizationId, record.id),
  ]);
  return {
    ...record,
    actions: actions.map((action): ContractorSafetyAction => ({ ...action, taskId: taskLinks.get(action.id) ?? null })),
  };
}

/** Site staff report an observation / hazard / incident about a contractor (internal reporter). */
export async function reportContractorSafety(
  context: OrgContext,
  raw: ReportContractorSafetyInput,
): Promise<ContractorSafetyRecord> {
  const input = parseOrThrow(reportContractorSafetySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.SAFETY_MANAGE);
  if (input.agreementId) {
    const agreement = await findAgreementScope(context.db, context.organizationId, input.agreementId);
    if (!agreement || agreement.projectId !== input.projectId || agreement.vendorId !== input.vendorId) {
      throw new NotFoundError('Subcontract agreement');
    }
  }

  const base = await insertSafetyRecord(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    recordType: input.recordType,
    occurredAt: input.occurredAt,
    reporterUserId: context.userId,
    severity: input.severity,
    title: input.title,
    description: input.description,
    immediateAction: input.immediateAction,
    status: 'open',
  });
  await insertContractorLink(context.db, {
    safetyRecordId: base.id,
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorId: input.vendorId,
    subcontractAgreementId: input.agreementId,
    locationId: input.locationId,
    dueDate: input.dueDate,
    contractorVisible: input.contractorVisible,
    reportedActorType: 'internal',
    reportedByUserId: context.userId,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.SAFETY_RECORD_REPORTED,
    entityType: SAFETY_RECORD_ENTITY,
    entityId: base.id,
    actor: internalActor(context.userId),
    payload: {
      recordType: input.recordType,
      severity: input.severity,
      vendorId: input.vendorId,
      agreementId: input.agreementId,
      contractorVisible: input.contractorVisible,
    },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_SAFETY_REPORTED,
    entityType: SAFETY_RECORD_ENTITY,
    entityId: base.id,
    after: { recordType: input.recordType, severity: input.severity, vendorId: input.vendorId },
  });
  return (await findContractorSafetyRecord(context.db, context.organizationId, base.id))!;
}

export async function updateContractorSafetyStatus(
  context: OrgContext,
  input: { readonly projectId: string; readonly safetyRecordId: string; readonly status: Exclude<SafetyRecordStatus, 'closed'> },
): Promise<void> {
  await assertProjectCapability(context, input.projectId, C.SAFETY_MANAGE);
  const record = await requireRecordOnProject(context, input.projectId, input.safetyRecordId);
  assertSafetyRecordStatusTransition(record.status, input.status);
  await updateSafetyRecordById(context.db, context.organizationId, record.id, {
    status: input.status,
    closedAt: closedAtForSafetyRecordStatus(input.status),
    closedByUserId: input.status === 'cancelled' ? context.userId : null,
  });
  if (record.status === 'closed') {
    await updateContractorLink(context.db, context.organizationId, record.id, {
      closureVerifiedAt: null,
      closureVerifiedByUserId: null,
      closureVerificationNote: null,
    });
  }
}

/**
 * Corrective action on a contractor safety record + (optionally) a follow-up task in the existing
 * tasks system through Track G's `createLinkedTask`, assigned to the contractor or an internal user.
 */
export async function addContractorCorrectiveAction(
  context: OrgContext,
  raw: AddContractorCorrectiveActionInput,
): Promise<ContractorSafetyAction> {
  const input = parseOrThrow(addContractorCorrectiveActionSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.SAFETY_MANAGE);
  const record = await requireRecordOnProject(context, input.projectId, input.safetyRecordId);

  const action = await insertCorrectiveAction(context.db, {
    organizationId: context.organizationId,
    safetyRecordId: record.id,
    title: input.title,
    description: input.description,
    ownerUserId: input.ownerUserId,
    dueDate: input.dueDate,
    status: 'open',
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_SAFETY_ACTION_CREATED,
    entityType: 'safety_corrective_action',
    entityId: action.id,
    after: { safetyRecordId: record.id, dueDate: action.dueDate },
  });

  let taskId: string | null = null;
  if (input.createTask) {
    const result = await createLinkedTask(context, {
      projectId: record.projectId,
      title: input.title,
      description: input.description ?? record.title,
      dueDate: input.dueDate ?? record.dueDate,
      priority: taskPriorityForSeverity(record.severity),
      assignee: input.assignToContractor
        ? { kind: 'contractor', vendorId: record.vendorId, subcontractAgreementId: record.subcontractAgreementId }
        : input.ownerUserId
          ? { kind: 'user', userId: input.ownerUserId }
          : { kind: 'none' },
      locationId: record.locationId,
      requiresEvidence: true,
      sources: [{ entityType: SAFETY_RECORD_ENTITY, entityId: record.id, relation: 'corrective_action' }],
    });
    taskId = result.taskId;
    await insertActionTaskLink(context.db, {
      correctiveActionId: action.id,
      organizationId: context.organizationId,
      safetyRecordId: record.id,
      taskId,
      createdByUserId: context.userId,
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.CONTRACTOR_SAFETY_TASK_CREATED,
      entityType: 'safety_corrective_action',
      entityId: action.id,
      after: { taskId, assignToContractor: input.assignToContractor },
    });
  }
  return { ...action, taskId };
}

export async function updateContractorCorrectiveActionStatus(
  context: OrgContext,
  input: {
    readonly projectId: string;
    readonly safetyRecordId: string;
    readonly actionId: string;
    readonly status: SafetyActionStatus;
  },
): Promise<void> {
  await assertProjectCapability(context, input.projectId, C.SAFETY_MANAGE);
  const record = await requireRecordOnProject(context, input.projectId, input.safetyRecordId);
  const action = await findCorrectiveActionById(context.db, context.organizationId, input.actionId);
  if (!action || action.safetyRecordId !== record.id) throw new NotFoundError('Corrective action');
  assertSafetyActionStatusTransition(action.status, input.status);
  await updateCorrectiveActionById(context.db, context.organizationId, action.id, {
    status: input.status,
    closedAt: closedAtForSafetyActionStatus(input.status),
  });
}

/** Closure with on-site verification (all corrective actions done/cancelled). */
export async function closeContractorSafety(
  context: OrgContext,
  raw: CloseContractorSafetyInput,
): Promise<void> {
  const input = parseOrThrow(closeContractorSafetySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.SAFETY_MANAGE);
  const record = await requireRecordOnProject(context, input.projectId, input.safetyRecordId);
  const actions = await listCorrectiveActionsForRecord(context.db, context.organizationId, record.id);
  assertCanCloseContractorSafety({
    status: record.status,
    actionStatuses: actions.map((action) => action.status),
    verificationNote: input.verificationNote,
  });
  const now = new Date();
  await updateSafetyRecordById(
    context.db,
    context.organizationId,
    record.id,
    { status: 'closed', closedAt: now, closedByUserId: context.userId },
    { fromStatuses: ['open', 'in_progress'] },
  );
  await updateContractorLink(context.db, context.organizationId, record.id, {
    closureVerifiedAt: now,
    closureVerifiedByUserId: context.userId,
    closureVerificationNote: input.verificationNote!.trim(),
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: record.projectId,
    type: DOMAIN_EVENTS.SAFETY_RECORD_CLOSED,
    entityType: SAFETY_RECORD_ENTITY,
    entityId: record.id,
    actor: internalActor(context.userId),
    payload: { vendorId: record.vendorId, agreementId: record.subcontractAgreementId, severity: record.severity },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_SAFETY_CLOSED,
    entityType: SAFETY_RECORD_ENTITY,
    entityId: record.id,
    before: { status: record.status },
    after: { status: 'closed' },
  });
}
