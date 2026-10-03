import { AUDIT_ACTIONS } from '@/shared/audit';
import { actorColumns, externalActor } from '@/shared/actor';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import {
  EXTERNAL_CAPABILITIES,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { isRfiOverdue, nextRfiStatus } from '../domain/lifecycle';
import type { RfiDetail, RfiListItem, RfiStatus } from '../domain/types';
import {
  findRfiRow,
  insertRfi,
  insertRfiStatusEvent,
  listRfiRows,
  loadRfiDetail,
  updateRfiRow,
  type RfiPatch,
  type RfiRow,
} from '../data/rfi.repository';
import {
  createExternalRfiSchema,
  updateExternalRfiSchema,
  type CreateExternalRfiInput,
  type UpdateExternalRfiInput,
} from '../validation/schemas';
import { coveringGrants, parseOrThrow, recordExternalAuditEvent, scopedVendorIdsAny } from './support';

/**
 * Contractor (external principal) RFI use-cases. Every call starts from the grant: the vendor/agreement
 * written on the row comes from the covering grant, never from the browser, and reads are both RLS-bound
 * (`ctx.db`) and filtered by the grant's vendors. Contractor A never sees contractor B.
 */

const RFI_ENTITY = 'rfi';
const CAP = EXTERNAL_CAPABILITIES.RFI_RAISE;
const READ_CAPABILITIES = [EXTERNAL_CAPABILITIES.RFI_VIEW, EXTERNAL_CAPABILITIES.RFI_RAISE] as const;

function scopeOf(row: RfiRow) {
  return {
    organizationId: row.organizationId,
    projectId: row.projectId,
    vendorId: row.vendorId ?? '',
    subcontractAgreementId: row.subcontractAgreementId,
  };
}

/** Loads an RFI the principal may act on; anything else is NotFound (no existence oracle). */
async function loadOwnRfi(
  context: ExternalContext,
  organizationId: string,
  rfiId: string,
  capabilities: readonly ((typeof READ_CAPABILITIES)[number])[] = READ_CAPABILITIES,
): Promise<RfiRow> {
  const row = await findRfiRow(context.db, organizationId, rfiId);
  if (
    !row ||
    !row.vendorId ||
    row.archivedAt ||
    !capabilities.some((capability) => hasExternalScope(context, scopeOf(row), capability))
  ) {
    throw new NotFoundError('RFI');
  }
  return row;
}

export async function createContractorRfi(
  context: ExternalContext,
  raw: CreateExternalRfiInput,
): Promise<{ rfiId: string; number: number; status: RfiStatus }> {
  const input = parseOrThrow(createExternalRfiSchema.safeParse(raw));
  const grant = coveringGrants(context, input.organizationId, input.projectId, CAP, input.vendorId)[0];
  if (!grant) throw new AuthorizationError(`external:${CAP}`);
  const target = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorId: grant.vendorId,
    subcontractAgreementId: grant.subcontractAgreementId,
  };
  requireExternalScope(context, target, CAP);

  return withTransaction(context.db, async (tx) => {
    const status: 'draft' | 'submitted' = input.submit ? 'submitted' : 'draft';
    const created = await insertRfi(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: grant.vendorId,
      subcontractAgreementId: grant.subcontractAgreementId,
      subject: input.subject,
      question: input.question,
      locationId: input.locationId ?? null,
      drawingId: input.drawingId ?? null,
      drawingRevisionId: input.drawingRevisionId ?? null,
      drawingReference: input.drawingReference ?? null,
      workPackageId: input.workPackageId ?? null,
      priority: input.priority ?? 'normal',
      dueDate: input.dueDate ?? null,
      assigneeUserId: null,
      status,
      submittedAt: status === 'submitted' ? new Date() : null,
      raisedActorType: 'external',
      raisedByUserId: null,
      raisedByPrincipalId: context.principalId,
    });
    const actor = externalActor(context.principalId);
    await insertRfiStatusEvent(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      rfiId: created.id,
      fromStatus: null,
      toStatus: status,
      reason: null,
      actor: actorColumns(actor),
    });
    await recordExternalAuditEvent(tx, context, {
      organizationId: input.organizationId,
      action: status === 'submitted' ? AUDIT_ACTIONS.RFI_SUBMITTED : AUDIT_ACTIONS.RFI_CREATED,
      entityType: RFI_ENTITY,
      entityId: created.id,
      after: { id: created.id, number: created.number, status, vendorId: grant.vendorId },
    });
    if (status === 'submitted') {
      await emitDomainEvent(tx, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        type: DOMAIN_EVENTS.RFI_REQUEST_SUBMITTED,
        entityType: RFI_ENTITY,
        entityId: created.id,
        actor,
        payload: {
          rfiId: created.id,
          number: created.number,
          status,
          vendorId: grant.vendorId,
          subcontractAgreementId: grant.subcontractAgreementId,
          dueDate: input.dueDate ?? null,
        },
      });
    }
    return { rfiId: created.id, number: created.number, status };
  });
}

export async function updateContractorRfi(context: ExternalContext, raw: UpdateExternalRfiInput): Promise<RfiRow> {
  const input = parseOrThrow(updateExternalRfiSchema.safeParse(raw));
  const existing = await loadOwnRfi(context, input.organizationId, input.rfiId, [CAP]);
  if (existing.raisedActorType !== 'external' || existing.status !== 'draft') {
    throw new DomainRuleError('Only contractor drafts can be edited', 'rfi.errors.contractorDraftOnly');
  }
  const patch: RfiPatch = {};
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.question !== undefined) patch.question = input.question;
  if (input.locationId !== undefined) patch.locationId = input.locationId ?? null;
  if (input.drawingId !== undefined) patch.drawingId = input.drawingId ?? null;
  if (input.drawingRevisionId !== undefined) patch.drawingRevisionId = input.drawingRevisionId ?? null;
  if (input.drawingReference !== undefined) patch.drawingReference = input.drawingReference ?? null;
  if (input.workPackageId !== undefined) patch.workPackageId = input.workPackageId ?? null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ?? null;
  if (Object.keys(patch).length === 0) return existing;

  return withTransaction(context.db, async (tx) => {
    const updated = await updateRfiRow(tx, existing.organizationId, existing.id, 'draft', patch);
    if (!updated) throw new ConflictError('RFI changed concurrently', 'rfi.errors.concurrentChange');
    await recordExternalAuditEvent(tx, context, {
      organizationId: existing.organizationId,
      action: AUDIT_ACTIONS.RFI_UPDATED,
      entityType: RFI_ENTITY,
      entityId: existing.id,
      after: { id: existing.id, fields: Object.keys(patch) },
    });
    return updated;
  });
}

export async function submitContractorRfi(
  context: ExternalContext,
  input: { organizationId: string; rfiId: string },
): Promise<RfiRow> {
  const existing = await loadOwnRfi(context, input.organizationId, input.rfiId, [CAP]);
  if (existing.raisedActorType !== 'external') {
    throw new DomainRuleError('Only contractor drafts can be submitted', 'rfi.errors.contractorDraftOnly');
  }
  const next = nextRfiStatus(existing.status, 'submit', 'external');

  return withTransaction(context.db, async (tx) => {
    const updated = await updateRfiRow(tx, existing.organizationId, existing.id, existing.status, {
      status: next,
      submittedAt: new Date(),
    });
    if (!updated) throw new ConflictError('RFI changed concurrently', 'rfi.errors.concurrentChange');
    const actor = externalActor(context.principalId);
    await insertRfiStatusEvent(tx, {
      organizationId: existing.organizationId,
      projectId: existing.projectId,
      rfiId: existing.id,
      fromStatus: existing.status,
      toStatus: next,
      reason: null,
      actor: actorColumns(actor),
    });
    await recordExternalAuditEvent(tx, context, {
      organizationId: existing.organizationId,
      action: AUDIT_ACTIONS.RFI_SUBMITTED,
      entityType: RFI_ENTITY,
      entityId: existing.id,
      after: { status: next },
    });
    await emitDomainEvent(tx, {
      organizationId: existing.organizationId,
      projectId: existing.projectId,
      type: DOMAIN_EVENTS.RFI_REQUEST_SUBMITTED,
      entityType: RFI_ENTITY,
      entityId: existing.id,
      actor,
      payload: {
        rfiId: existing.id,
        number: existing.number,
        status: next,
        vendorId: existing.vendorId,
        subcontractAgreementId: existing.subcontractAgreementId,
        dueDate: existing.dueDate,
      },
    });
    return updated;
  });
}

export interface ContractorRfiView extends RfiDetail {
  readonly overdue: boolean;
  readonly canEdit: boolean;
  readonly canSubmit: boolean;
}

export async function getContractorRfi(
  context: ExternalContext,
  input: { organizationId: string; rfiId: string },
): Promise<ContractorRfiView> {
  const row = await loadOwnRfi(context, input.organizationId, input.rfiId);
  const detail = await loadRfiDetail(context.db, input.organizationId, row.id, { includeInternalNames: false });
  if (!detail) throw new NotFoundError('RFI');
  const today = todayInTimeZone('UTC');
  const ownDraft = detail.raisedActorType === 'external' && detail.status === 'draft';
  const canWrite = hasExternalScope(context, scopeOf(row), CAP);
  return { ...detail, overdue: isRfiOverdue(detail, today), canEdit: ownDraft && canWrite, canSubmit: ownDraft && canWrite };
}

export async function listContractorRfis(
  context: ExternalContext,
  input: { organizationId: string; projectId: string; status?: RfiStatus | 'open' | null; limit?: number },
): Promise<readonly (RfiListItem & { readonly overdue: boolean })[]> {
  const vendorIds = scopedVendorIdsAny(context, input.organizationId, input.projectId, READ_CAPABILITIES);
  if (vendorIds.length === 0) throw new AuthorizationError(`external:${EXTERNAL_CAPABILITIES.RFI_VIEW}`);
  const today = todayInTimeZone('UTC');
  const rows = await listRfiRows(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorIds,
    statuses:
      input.status === 'open'
        ? ['draft', 'submitted', 'under_review', 'answered']
        : input.status
          ? [input.status]
          : null,
    limit: Math.min(Math.max(input.limit ?? 100, 1), 200),
  });
  return rows.map((row) => ({
    ...row,
    // Internal names never reach the contractor.
    assigneeUserId: null,
    assigneeName: null,
    overdue: isRfiOverdue(row, today),
  }));
}
