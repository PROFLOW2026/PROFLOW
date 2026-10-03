import { AUDIT_ACTIONS } from '@/shared/audit';
import { externalActor } from '@/shared/actor';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { coveringGrants, parseOrThrow, recordExternalAuditEvent, requireScopedVendors } from '@/modules/rfi';
import { availableSubmittalActions, isSubmittalOverdue } from '../domain/lifecycle';
import {
  SUBMITTAL_CONTRACTOR_ACTION_STATUSES,
  SUBMITTAL_PENDING_STATUSES,
  type SubmittalAction,
  type SubmittalDetail,
  type SubmittalListItem,
  type SubmittalStatus,
} from '../domain/types';
import {
  findSubmittalRow,
  insertRevision,
  insertSubmittal,
  listSubmittalRows,
  loadSubmittalDetail,
  updateSubmittalRow,
  type SubmittalPatch,
  type SubmittalRow,
} from '../data/submittals.repository';
import {
  createExternalSubmittalSchema,
  updateExternalSubmittalSchema,
  type CreateExternalSubmittalInput,
  type UpdateExternalSubmittalInput,
} from '../validation/schemas';
import {
  openRevisionCore,
  submitCore,
  SUBMITTAL_ENTITY,
  updateRevisionNotesCore,
  withdrawCore,
  type SubmittalRuntime,
} from './core';

/**
 * Contractor submittal use-cases. Vendor / agreement come from the covering grant; every read is
 * RLS-bound (`ctx.db`) and filtered by the grant's vendors, so contractor A never sees contractor B.
 */

const CAP = EXTERNAL_CAPABILITIES.SUBMITTAL_SUBMIT;

function externalRuntime(context: ExternalContext, db: DbExecutor, organizationId: string): SubmittalRuntime {
  return {
    db,
    actor: externalActor(context.principalId),
    actorType: 'external',
    audit: (input) =>
      recordExternalAuditEvent(db, context, {
        organizationId,
        action: input.action,
        entityType: SUBMITTAL_ENTITY,
        entityId: input.entityId,
        after: input.after,
        metadata: input.before === undefined ? undefined : { before: input.before },
      }),
  };
}

async function loadOwn(context: ExternalContext, organizationId: string, submittalId: string): Promise<SubmittalRow> {
  const row = await findSubmittalRow(context.db, organizationId, submittalId);
  if (
    !row ||
    row.archivedAt ||
    !hasExternalScope(
      context,
      {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
      },
      CAP,
    )
  ) {
    throw new NotFoundError('Submittal');
  }
  return row;
}

export async function createContractorSubmittal(
  context: ExternalContext,
  raw: CreateExternalSubmittalInput,
): Promise<{ submittalId: string; number: number; revisionId: string }> {
  const input = parseOrThrow(createExternalSubmittalSchema.safeParse(raw));
  const grant = coveringGrants(context, input.organizationId, input.projectId, CAP, input.vendorId)[0];
  if (!grant) throw new AuthorizationError(`external:${CAP}`);
  requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: grant.vendorId,
      subcontractAgreementId: grant.subcontractAgreementId,
    },
    CAP,
  );

  return withTransaction(context.db, async (tx) => {
    const created = await insertSubmittal(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: grant.vendorId,
      subcontractAgreementId: grant.subcontractAgreementId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      specSection: input.specSection ?? null,
      locationId: input.locationId ?? null,
      drawingId: input.drawingId ?? null,
      drawingRevisionId: input.drawingRevisionId ?? null,
      drawingReference: input.drawingReference ?? null,
      workPackageId: input.workPackageId ?? null,
      dueDate: null,
      reviewerUserId: null,
      createdActorType: 'external',
      createdByUserId: null,
      createdByPrincipalId: context.principalId,
    });
    const revisionId = await insertRevision(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      submittalId: created.id,
      vendorId: grant.vendorId,
      revisionNumber: 1,
      notes: input.notes ?? null,
      createdActorType: 'external',
      createdByUserId: null,
      createdByPrincipalId: context.principalId,
    });
    await recordExternalAuditEvent(tx, context, {
      organizationId: input.organizationId,
      action: AUDIT_ACTIONS.SUBMITTAL_CREATED,
      entityType: SUBMITTAL_ENTITY,
      entityId: created.id,
      after: { id: created.id, number: created.number, type: input.type, vendorId: grant.vendorId },
    });
    return { submittalId: created.id, number: created.number, revisionId };
  });
}

export async function updateContractorSubmittal(
  context: ExternalContext,
  raw: UpdateExternalSubmittalInput,
): Promise<SubmittalRow> {
  const input = parseOrThrow(updateExternalSubmittalSchema.safeParse(raw));
  const existing = await loadOwn(context, input.organizationId, input.submittalId);
  if (existing.status !== 'draft') {
    throw new DomainRuleError('Only drafts can be edited', 'submittals.errors.contentFrozen');
  }
  const patch: SubmittalPatch = {};
  const keys = [
    'type',
    'title',
    'description',
    'specSection',
    'locationId',
    'drawingId',
    'drawingRevisionId',
    'drawingReference',
    'workPackageId',
  ] as const;
  for (const key of keys) {
    if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key] ?? null;
  }
  if (Object.keys(patch).length === 0) return existing;
  return withTransaction(context.db, async (tx) => {
    const updated = await updateSubmittalRow(tx, existing, patch);
    if (!updated) throw new ConflictError('Submittal changed concurrently', 'submittals.errors.concurrentChange');
    await recordExternalAuditEvent(tx, context, {
      organizationId: existing.organizationId,
      action: AUDIT_ACTIONS.SUBMITTAL_UPDATED,
      entityType: SUBMITTAL_ENTITY,
      entityId: existing.id,
      after: { fields: Object.keys(patch) },
    });
    return updated;
  });
}

export async function updateContractorRevisionNotes(
  context: ExternalContext,
  input: { organizationId: string; submittalId: string; notes: string | null },
): Promise<void> {
  const existing = await loadOwn(context, input.organizationId, input.submittalId);
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 20000) : null;
  await withTransaction(context.db, (tx) =>
    updateRevisionNotesCore(externalRuntime(context, tx, existing.organizationId), existing, notes),
  );
}

export async function submitContractorSubmittal(
  context: ExternalContext,
  input: { organizationId: string; submittalId: string },
): Promise<SubmittalRow> {
  const existing = await loadOwn(context, input.organizationId, input.submittalId);
  return withTransaction(context.db, (tx) =>
    submitCore(externalRuntime(context, tx, existing.organizationId), existing),
  );
}

/** Resubmission after revise_and_resubmit / rejected: opens Rev N+1 as a draft. */
export async function openContractorRevision(
  context: ExternalContext,
  input: { organizationId: string; submittalId: string },
): Promise<{ revisionId: string; revisionNumber: number }> {
  const existing = await loadOwn(context, input.organizationId, input.submittalId);
  return withTransaction(context.db, async (tx) => {
    const result = await openRevisionCore(externalRuntime(context, tx, existing.organizationId), existing);
    return { revisionId: result.revisionId, revisionNumber: result.submittal.currentRevisionNumber };
  });
}

export async function withdrawContractorSubmittal(
  context: ExternalContext,
  input: { organizationId: string; submittalId: string },
): Promise<SubmittalRow> {
  const existing = await loadOwn(context, input.organizationId, input.submittalId);
  return withTransaction(context.db, (tx) =>
    withdrawCore(externalRuntime(context, tx, existing.organizationId), existing),
  );
}

export interface ContractorSubmittalView extends SubmittalDetail {
  readonly overdue: boolean;
  readonly availableActions: readonly SubmittalAction[];
  readonly draftRevisionId: string | null;
}

export async function getContractorSubmittal(
  context: ExternalContext,
  input: { organizationId: string; submittalId: string },
): Promise<ContractorSubmittalView> {
  const row = await loadOwn(context, input.organizationId, input.submittalId);
  const detail = await loadSubmittalDetail(context.db, input.organizationId, row.id, { includeInternalNames: false });
  if (!detail) throw new NotFoundError('Submittal');
  const current = detail.revisions.find((revision) => revision.revisionNumber === detail.currentRevisionNumber);
  return {
    ...detail,
    overdue: isSubmittalOverdue(detail, todayInTimeZone('UTC')),
    availableActions: availableSubmittalActions(detail.status, 'external'),
    draftRevisionId: current && !current.submittedAt && detail.status === 'draft' ? current.id : null,
  };
}

export async function listContractorSubmittals(
  context: ExternalContext,
  input: {
    organizationId: string;
    projectId: string;
    status?: SubmittalStatus | 'pending' | 'action_required' | null;
    limit?: number;
  },
): Promise<readonly (SubmittalListItem & { readonly overdue: boolean })[]> {
  const vendorIds = requireScopedVendors(context, input.organizationId, input.projectId, CAP);
  const today = todayInTimeZone('UTC');
  const statuses: readonly SubmittalStatus[] | null =
    input.status === 'pending'
      ? SUBMITTAL_PENDING_STATUSES
      : input.status === 'action_required'
        ? SUBMITTAL_CONTRACTOR_ACTION_STATUSES
        : input.status
          ? [input.status]
          : null;
  const rows = await listSubmittalRows(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorIds,
    statuses,
    limit: Math.min(Math.max(input.limit ?? 100, 1), 200),
  });
  return rows.map((row) => ({
    ...row,
    reviewerUserId: null,
    reviewerName: null,
    overdue: isSubmittalOverdue(row, today),
  }));
}
