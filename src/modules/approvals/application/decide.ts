import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findApprovalRequestById,
  updateApprovalRequestDecision,
} from '../data/approvals.repository';
import {
  cancelApprovalSchema,
  decideApprovalSchema,
  type CancelApprovalInput,
  type DecideApprovalInput,
} from '../validation/schemas';

export async function decideApprovalRequest(context: OrgContext, raw: DecideApprovalInput) {
  assertPermission(context, PERMISSIONS.APPROVALS_DECIDE);

  const parsed = decideApprovalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findApprovalRequestById(
    context.db,
    context.organizationId,
    input.requestId,
  );
  if (!existing) throw new NotFoundError('Approval request');
  if (existing.status !== 'submitted') {
    throw new DomainRuleError(
      'Only submitted requests can be decided',
      'approvals.errors.notSubmitted',
      { requestId: existing.id, status: existing.status },
    );
  }

  const decidedAt = new Date();
  const updated = await updateApprovalRequestDecision(
    context.db,
    context.organizationId,
    input.requestId,
    {
      status: input.decision,
      decidedByUserId: context.userId,
      decidedAt,
      decisionNote: input.decisionNote ?? null,
    },
  );
  if (!updated) throw new NotFoundError('Approval request');

  await noteModuleUsage(context.db, context.organizationId, 'approvals');
  await recordAuditEvent(context, {
    action:
      input.decision === 'approved'
        ? AUDIT_ACTIONS.APPROVAL_REQUEST_APPROVED
        : AUDIT_ACTIONS.APPROVAL_REQUEST_REJECTED,
    entityType: 'approval_request',
    entityId: updated.id,
    before: { status: 'submitted' },
    after: {
      status: updated.status,
      decidedAt,
      decisionNote: updated.decisionNote,
      entityType: updated.entityType,
      entityId: updated.entityId,
    },
  });

  return updated;
}

export async function cancelApprovalRequest(context: OrgContext, raw: CancelApprovalInput) {
  if (
    !hasPermission(context, PERMISSIONS.APPROVALS_MANAGE) &&
    !hasPermission(context, PERMISSIONS.APPROVALS_DECIDE)
  ) {
    assertPermission(context, PERMISSIONS.APPROVALS_DECIDE);
  }

  const parsed = cancelApprovalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findApprovalRequestById(
    context.db,
    context.organizationId,
    input.requestId,
  );
  if (!existing) throw new NotFoundError('Approval request');
  if (existing.status !== 'submitted') {
    throw new DomainRuleError(
      'Only submitted requests can be cancelled',
      'approvals.errors.notSubmitted',
      { requestId: existing.id, status: existing.status },
    );
  }

  const decidedAt = new Date();
  const updated = await updateApprovalRequestDecision(
    context.db,
    context.organizationId,
    input.requestId,
    {
      status: 'cancelled',
      decidedByUserId: context.userId,
      decidedAt,
      decisionNote: input.decisionNote ?? null,
    },
  );
  if (!updated) throw new NotFoundError('Approval request');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVAL_REQUEST_CANCELLED,
    entityType: 'approval_request',
    entityId: updated.id,
    before: { status: 'submitted' },
    after: { status: 'cancelled', decidedAt },
  });

  return updated;
}
