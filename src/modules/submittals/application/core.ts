import { AUDIT_ACTIONS, type AuditAction } from '@/shared/audit';
import { actorColumns, type Actor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { ConflictError, DomainRuleError } from '@/shared/errors';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { isRevisionEditable, nextSubmittalStatus } from '../domain/lifecycle';
import type { SubmittalActorType } from '../domain/types';
import {
  findCurrentRevision,
  insertRevision,
  updateDraftRevision,
  updateSubmittalRow,
  type SubmittalRevisionRow,
  type SubmittalRow,
} from '../data/submittals.repository';

/**
 * Lifecycle steps shared by the internal (project team) and contractor surfaces. Callers authorize first
 * and pass a runtime bound to an open transaction; each step writes state + audit + domain event together.
 */

export const SUBMITTAL_ENTITY = 'submittal';

export interface SubmittalRuntime {
  readonly db: DbExecutor;
  readonly actor: Actor;
  readonly actorType: SubmittalActorType;
  audit(input: {
    action: AuditAction;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

function concurrent(): never {
  throw new ConflictError('Submittal changed concurrently', 'submittals.errors.concurrentChange');
}

export async function requireDraftRevision(db: DbExecutor, row: SubmittalRow): Promise<SubmittalRevisionRow> {
  const revision = await findCurrentRevision(db, row);
  if (!revision || !isRevisionEditable(revision)) {
    throw new DomainRuleError('The current revision is already submitted', 'submittals.errors.revisionFrozen');
  }
  return revision;
}

export async function updateRevisionNotesCore(
  runtime: SubmittalRuntime,
  row: SubmittalRow,
  notes: string | null,
): Promise<void> {
  if (row.status !== 'draft') {
    throw new DomainRuleError('Only a draft revision can be edited', 'submittals.errors.revisionFrozen');
  }
  const revision = await requireDraftRevision(runtime.db, row);
  const updated = await updateDraftRevision(runtime.db, row.organizationId, revision.id, { notes });
  if (!updated) concurrent();
  await runtime.audit({
    action: AUDIT_ACTIONS.SUBMITTAL_UPDATED,
    entityId: row.id,
    after: { revisionNumber: revision.revisionNumber, notesChanged: true },
  });
}

/** Submits the current draft revision: it becomes immutable and the submittal awaits review. */
export async function submitCore(runtime: SubmittalRuntime, row: SubmittalRow): Promise<SubmittalRow> {
  const next = nextSubmittalStatus(row.status, 'submit', runtime.actorType);
  const revision = await requireDraftRevision(runtime.db, row);
  const now = new Date();
  const actor = actorColumns(runtime.actor);
  const submittedRevision = await updateDraftRevision(runtime.db, row.organizationId, revision.id, {
    submittedAt: now,
    submittedActorType: runtime.actorType,
    submittedByUserId: actor.actorUserId,
    submittedByPrincipalId: actor.actorPrincipalId,
  });
  if (!submittedRevision) concurrent();
  const updated = await updateSubmittalRow(runtime.db, row, { status: next, submittedAt: now });
  if (!updated) concurrent();
  await runtime.audit({
    action: AUDIT_ACTIONS.SUBMITTAL_SUBMITTED,
    entityId: row.id,
    before: { status: row.status },
    after: { status: next, revisionNumber: revision.revisionNumber },
  });
  await emitDomainEvent(runtime.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.SUBMITTAL_PACKAGE_SUBMITTED,
    entityType: SUBMITTAL_ENTITY,
    entityId: row.id,
    actor: runtime.actor,
    payload: {
      submittalId: row.id,
      number: row.number,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      status: next,
      type: row.type,
      vendorId: row.vendorId,
      subcontractAgreementId: row.subcontractAgreementId,
      reviewerUserId: row.reviewerUserId,
      dueDate: row.dueDate,
    },
  });
  return updated;
}

/** revise_and_resubmit | rejected -> Rev N+1 as a new draft; previous revisions stay untouched. */
export async function openRevisionCore(
  runtime: SubmittalRuntime,
  row: SubmittalRow,
  notes: string | null = null,
): Promise<{ submittal: SubmittalRow; revisionId: string }> {
  const next = nextSubmittalStatus(row.status, 'open_revision', runtime.actorType);
  const revisionNumber = row.currentRevisionNumber + 1;
  const updated = await updateSubmittalRow(runtime.db, row, {
    status: next,
    currentRevisionNumber: revisionNumber,
  });
  if (!updated) concurrent();
  const actor = actorColumns(runtime.actor);
  const revisionId = await insertRevision(runtime.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    submittalId: row.id,
    vendorId: row.vendorId,
    revisionNumber,
    notes,
    createdActorType: runtime.actorType,
    createdByUserId: actor.actorUserId,
    createdByPrincipalId: actor.actorPrincipalId,
  });
  await runtime.audit({
    action: AUDIT_ACTIONS.SUBMITTAL_REVISION_OPENED,
    entityId: row.id,
    before: { status: row.status, revisionNumber: row.currentRevisionNumber },
    after: { status: next, revisionNumber },
  });
  return { submittal: updated, revisionId };
}

export async function withdrawCore(runtime: SubmittalRuntime, row: SubmittalRow): Promise<SubmittalRow> {
  const next = nextSubmittalStatus(row.status, 'withdraw', runtime.actorType);
  const updated = await updateSubmittalRow(runtime.db, row, { status: next });
  if (!updated) concurrent();
  await runtime.audit({
    action: AUDIT_ACTIONS.SUBMITTAL_WITHDRAWN,
    entityId: row.id,
    before: { status: row.status },
    after: { status: next },
  });
  return updated;
}
