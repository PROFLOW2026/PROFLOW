import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { findWorkPackageInProject, listProjectAgreementsOperational, listProjectWorkPackageOptions } from '../data/agreements.repository';
import {
  findUnpricedWorkScope,
  insertUnpricedWork,
  listProjectUnpricedWork as listProjectUnpricedWorkRows,
  lockUnpricedWork,
  updateUnpricedWorkRow,
} from '../data/unpriced-work.repository';
import { findLocationInProject, listProjectLocationOptions } from '../data/work-lines.repository';
import { assertAgreementAcceptsChanges, assertUnpricedWorkAction } from '../domain/lifecycle';
import type { UnpricedWorkStatus } from '../domain/types';
import {
  recordUnpricedWorkSchema,
  unpricedDecisionSchema,
  type RecordUnpricedWorkInput,
  type UnpricedDecisionInput,
} from '../validation/schemas';
import { loadAgreementWithAccess, loadSubcontractAccess, parseOrThrow, requireAccess } from './access';
import { insertInternalChange } from './changes';

const E = DOMAIN_EVENTS;

/** Records work performed before it was priced (contractor.coordinate). No money. */
export async function recordUnpricedWork(
  context: OrgContext,
  rawInput: RecordUnpricedWorkInput,
): Promise<{ unpricedWorkId: string }> {
  const input = parseOrThrow(recordUnpricedWorkSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAccess(access, 'canCoordinate');
  if (agreement.status === 'draft' || agreement.status === 'closed' || agreement.status === 'cancelled') {
    throw new DomainRuleError(
      'Unpriced work is recorded on running agreements',
      'subcontracts.errors.unpricedRequiresRunningAgreement',
      { status: agreement.status },
    );
  }
  if (input.locationId && !(await findLocationInProject(context.db, context.organizationId, agreement.projectId, input.locationId))) {
    throw new ValidationError([{ path: 'locationId', message: 'subcontracts.validation.locationProject' }]);
  }
  if (
    input.workPackageId &&
    !(await findWorkPackageInProject(context.db, context.organizationId, agreement.projectId, input.workPackageId))
  ) {
    throw new ValidationError([{ path: 'workPackageId', message: 'subcontracts.validation.workPackageProject' }]);
  }

  const id = await withTransaction(context.db, async (tx) => {
    const created = await insertUnpricedWork(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      agreementId: agreement.id,
      title: input.title,
      scopeDescription: input.scopeDescription ?? null,
      locationId: input.locationId ?? null,
      workPackageId: input.workPackageId ?? null,
      workDate: input.workDate,
      issuerName: input.issuerName ?? null,
      issuedByUserId: input.issuedByUserId ?? null,
      sourceEntityType: input.source?.type ?? null,
      sourceEntityId: input.source?.id ?? null,
      status: 'recorded',
      createdActorType: 'internal',
      createdByUserId: context.userId,
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_UNPRICED_WORK_RECORDED,
      entityType: 'unpriced_work',
      entityId: created,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, workDate: input.workDate },
    });
    await recordAuditEvent(
      { ...context, db: tx },
      {
        action: AUDIT_ACTIONS.DG_UNPRICED_WORK_RECORDED,
        entityType: 'unpriced_work',
        entityId: created,
        after: { agreementId: agreement.id, title: input.title, workDate: input.workDate },
      },
    );
    return created;
  });
  return { unpricedWorkId: id };
}

async function loadUnpricedWithAccess(context: OrgContext, unpricedWorkId: string) {
  const scope = await findUnpricedWorkScope(context.db, context.organizationId, unpricedWorkId);
  if (!scope) throw new NotFoundError('Unpriced work');
  return loadAgreementWithAccess(context, scope.agreementId);
}

/** Converts a record into a draft change (origin unpriced_work) for pricing; the record becomes final. */
export async function convertUnpricedWorkToChange(
  context: OrgContext,
  rawInput: UnpricedDecisionInput,
): Promise<{ changeId: string }> {
  const input = parseOrThrow(unpricedDecisionSchema.safeParse(rawInput));
  const { agreement, access } = await loadUnpricedWithAccess(context, input.unpricedWorkId);
  requireAccess(access, 'canCoordinate');
  assertAgreementAcceptsChanges(agreement.status);

  const changeId = await withTransaction(context.db, async (tx) => {
    const record = await lockUnpricedWork(tx, context.organizationId, input.unpricedWorkId);
    if (!record) throw new NotFoundError('Unpriced work');
    assertUnpricedWorkAction(record.status as UnpricedWorkStatus, 'convert');
    const createdChangeId = await insertInternalChange(context, tx, {
      agreement,
      changeType:
        input.changeType && input.changeType !== 'contractor_proposal' ? input.changeType : 'instruction',
      title: record.title,
      description: record.scopeDescription,
      origin: 'unpriced_work',
      timeExtensionDays: null,
      source: { type: 'unpriced_work', id: record.id },
    });
    const updated = await updateUnpricedWorkRow(tx, context.organizationId, record.id, {
      status: 'converted',
      convertedChangeId: createdChangeId,
      decidedAt: new Date(),
      decidedByUserId: context.userId,
      decisionReason: input.reason ?? null,
    });
    if (!updated) throw new ConflictError('Unpriced work was updated concurrently');
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_UNPRICED_WORK_CONVERTED,
      entityType: 'unpriced_work',
      entityId: record.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, changeId: createdChangeId },
    });
    await recordAuditEvent(
      { ...context, db: tx },
      {
        action: AUDIT_ACTIONS.DG_UNPRICED_WORK_CONVERTED,
        entityType: 'unpriced_work',
        entityId: record.id,
        after: { status: 'converted', changeId: createdChangeId },
      },
    );
    return createdChangeId;
  });
  return { changeId };
}

async function closeUnpriced(
  context: OrgContext,
  rawInput: UnpricedDecisionInput,
  target: 'rejected' | 'cancelled',
): Promise<void> {
  const input = parseOrThrow(unpricedDecisionSchema.safeParse(rawInput));
  if (!input.reason) throw new ValidationError([{ path: 'reason', message: 'subcontracts.validation.reasonRequired' }]);
  const { agreement, access } = await loadUnpricedWithAccess(context, input.unpricedWorkId);
  requireAccess(access, 'canCoordinate');
  await withTransaction(context.db, async (tx) => {
    const record = await lockUnpricedWork(tx, context.organizationId, input.unpricedWorkId);
    if (!record) throw new NotFoundError('Unpriced work');
    assertUnpricedWorkAction(record.status as UnpricedWorkStatus, target === 'rejected' ? 'reject' : 'cancel');
    const updated = await updateUnpricedWorkRow(tx, context.organizationId, record.id, {
      status: target,
      decidedAt: new Date(),
      decidedByUserId: context.userId,
      decisionReason: input.reason ?? null,
    });
    if (!updated) throw new ConflictError('Unpriced work was updated concurrently');
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: target === 'rejected' ? E.SUBCONTRACT_UNPRICED_WORK_REJECTED : E.SUBCONTRACT_UNPRICED_WORK_CANCELLED,
      entityType: 'unpriced_work',
      entityId: record.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, status: target },
    });
    await recordAuditEvent(
      { ...context, db: tx },
      {
        action: target === 'rejected' ? AUDIT_ACTIONS.DG_UNPRICED_WORK_REJECTED : AUDIT_ACTIONS.DG_UNPRICED_WORK_CANCELLED,
        entityType: 'unpriced_work',
        entityId: record.id,
        after: { status: target, reason: input.reason },
      },
    );
  });
}

export function rejectUnpricedWork(context: OrgContext, input: UnpricedDecisionInput): Promise<void> {
  return closeUnpriced(context, input, 'rejected');
}

export function cancelUnpricedWork(context: OrgContext, input: UnpricedDecisionInput): Promise<void> {
  return closeUnpriced(context, input, 'cancelled');
}

/** Unpriced-work page data for one project (operational only). */
export async function getProjectUnpricedWork(
  context: OrgContext,
  projectId: string,
  filters: { status?: UnpricedWorkStatus | 'open' | 'all'; offset?: number } = {},
) {
  const access = await loadSubcontractAccess(context, projectId);
  if (!access.canView) throw new NotFoundError('Project');
  const statuses: UnpricedWorkStatus[] | undefined =
    !filters.status || filters.status === 'open'
      ? ['recorded']
      : filters.status === 'all'
        ? undefined
        : [filters.status];
  const [items, agreements, locations, workPackages] = await Promise.all([
    listProjectUnpricedWorkRows(context.db, context.organizationId, projectId, {
      statuses,
      limit: 51,
      offset: filters.offset ?? 0,
    }),
    listProjectAgreementsOperational(context.db, context.organizationId, projectId),
    listProjectLocationOptions(context.db, context.organizationId, projectId),
    listProjectWorkPackageOptions(context.db, context.organizationId, projectId),
  ]);
  return {
    access,
    items: items.slice(0, 50),
    hasMore: items.length > 50,
    agreements: agreements
      .filter((agreement) => ['active', 'suspended', 'completed'].includes(agreement.status))
      .map((agreement) => ({
        id: agreement.id,
        title: agreement.title,
        vendorName: agreement.vendorName,
        status: agreement.status,
      })),
    locations,
    workPackages,
  };
}
