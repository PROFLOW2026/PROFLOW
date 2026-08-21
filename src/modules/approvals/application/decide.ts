import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { canDecideCurrentStep } from '../domain/steps';
import {
  advanceApprovalRequestStep,
  decideRequestStep,
  findApprovalRequestById,
  listRequestSteps,
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
  const totalSteps = existing.totalSteps ?? 0;
  const currentStep = existing.currentStepOrder ?? null;
  const isMultiStep = totalSteps > 0 && currentStep != null;

  if (isMultiStep) {
    const requestSteps = await listRequestSteps(
      context.db,
      context.organizationId,
      existing.id,
    );
    const currentRequestStep =
      requestSteps.find((step) => step.stepOrder === currentStep) ?? null;

    const priorIncomplete = requestSteps.some(
      (step) => step.stepOrder < currentStep! && step.status !== 'approved',
    );
    if (priorIncomplete) {
      throw new DomainRuleError(
        'Earlier approval steps must be completed first',
        'approvals.errors.stepNotReady',
        { requestId: existing.id, stepOrder: currentStep },
      );
    }

    if (!currentRequestStep || currentRequestStep.status !== 'pending') {
      throw new DomainRuleError(
        'Current approval step is not pending',
        'approvals.errors.notSubmitted',
        { requestId: existing.id, stepOrder: currentStep },
      );
    }

    if (!canDecideCurrentStep(context, currentRequestStep)) {
      throw new DomainRuleError(
        'You are not eligible to decide this approval step',
        'approvals.errors.notEligible',
        { requestId: existing.id, stepOrder: currentStep },
      );
    }

    await decideRequestStep(context.db, context.organizationId, existing.id, currentStep, {
      status: input.decision,
      decidedByUserId: context.userId,
      decidedAt,
      decisionNote: input.decisionNote ?? null,
    });

    if (input.decision === 'rejected') {
      const updated = await updateApprovalRequestDecision(
        context.db,
        context.organizationId,
        input.requestId,
        {
          status: 'rejected',
          decidedByUserId: context.userId,
          decidedAt,
          decisionNote: input.decisionNote ?? null,
        },
      );
      if (!updated) throw new NotFoundError('Approval request');
      await noteModuleUsage(context.db, context.organizationId, 'approvals');
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.APPROVAL_REQUEST_REJECTED,
        entityType: 'approval_request',
        entityId: updated.id,
        before: { status: 'submitted', currentStepOrder: currentStep },
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

    // Approve: advance or finalize.
    if (currentStep < totalSteps) {
      const advanced = await advanceApprovalRequestStep(
        context.db,
        context.organizationId,
        existing.id,
        currentStep + 1,
      );
      if (!advanced) throw new NotFoundError('Approval request');
      await noteModuleUsage(context.db, context.organizationId, 'approvals');
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.APPROVAL_REQUEST_APPROVED,
        entityType: 'approval_request',
        entityId: advanced.id,
        before: { status: 'submitted', currentStepOrder: currentStep },
        after: {
          status: 'submitted',
          currentStepOrder: advanced.currentStepOrder,
          stepAdvanced: true,
          entityType: advanced.entityType,
          entityId: advanced.entityId,
        },
      });
      return advanced;
    }
  }

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
