import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { approvalCoversAmount, selectMatchingRule } from '../domain/rules';
import {
  findLatestRequestForEntityGate,
  findOpenRequestForEntity,
  insertApprovalRequest,
  insertApprovalRequestSteps,
  listEnabledRulesForEntity,
  listRuleSteps,
} from '../data/approvals.repository';
import {
  submitApprovalRequestSchema,
  type SubmitApprovalRequestInput,
} from '../validation/schemas';
import type { ApprovalRequestRecord } from '../domain/types';

export type SubmitApprovalResult =
  | { readonly kind: 'not_required' }
  | { readonly kind: 'already_open'; readonly request: ApprovalRequestRecord }
  | { readonly kind: 'already_approved'; readonly request: ApprovalRequestRecord }
  | { readonly kind: 'submitted'; readonly request: ApprovalRequestRecord };

async function createSubmittedRequest(
  context: OrgContext,
  input: {
    readonly ruleId: string | null;
    readonly entityType: SubmitApprovalRequestInput['entityType'];
    readonly entityId: string;
    readonly amount?: string | null;
    readonly currency?: string | null;
  },
): Promise<ApprovalRequestRecord> {
  const steps = input.ruleId
    ? await listRuleSteps(context.db, context.organizationId, input.ruleId)
    : [];
  const totalSteps = steps.length;
  const request = await insertApprovalRequest(context.db, {
    organizationId: context.organizationId,
    ruleId: input.ruleId,
    entityType: input.entityType,
    entityId: input.entityId,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    submittedByUserId: context.userId,
    // 0 steps = legacy single-step (null current/total).
    currentStepOrder: totalSteps > 0 ? 1 : null,
    totalSteps: totalSteps > 0 ? totalSteps : null,
  });
  if (totalSteps > 0) {
    await insertApprovalRequestSteps(
      context.db,
      context.organizationId,
      request.id,
      steps.map((step) => ({
        stepOrder: step.stepOrder,
        name: step.name,
        approverStrategy: step.approverStrategy,
        roleTemplateKey: step.roleTemplateKey,
        permissionKey: step.permissionKey,
        userId: step.userId,
      })),
    );
  }
  return request;
}

/**
 * Creates a submitted approval request when an enabled rule matches.
 * Idempotent for an open (submitted) request on the same entity.
 * Approvals 2.0: matching rule with steps creates request + request steps.
 */
export async function submitApprovalRequest(
  context: OrgContext,
  raw: SubmitApprovalRequestInput,
): Promise<SubmitApprovalResult> {
  // Submitters are domain actors (expense finalize, PO issue) - not approvals.manage.
  // Read permission is enough to open a request; decide is separate.
  assertPermission(context, PERMISSIONS.APPROVALS_READ);

  const parsed = submitApprovalRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const open = await findOpenRequestForEntity(
    context.db,
    context.organizationId,
    input.entityType,
    input.entityId,
  );
  if (open) return { kind: 'already_open', request: open };

  const latest = await findLatestRequestForEntityGate(
    context.db,
    context.organizationId,
    input.entityType,
    input.entityId,
  );
  if (
    latest?.status === 'approved' &&
    approvalCoversAmount({
      requestAmount: latest.amount,
      requestCurrency: latest.currency,
      currentAmount: input.amount,
      currentCurrency: input.currency,
    })
  ) {
    return { kind: 'already_approved', request: latest };
  }

  const rules = await listEnabledRulesForEntity(
    context.db,
    context.organizationId,
    input.entityType,
  );
  const matching = selectMatchingRule(rules, {
    entityType: input.entityType,
    amount: input.amount,
    currency: input.currency,
  });

  if (!matching) {
    if (input.requireMatchingRule !== false) {
      return { kind: 'not_required' };
    }
  }

  const request = await createSubmittedRequest(context, {
    ruleId: matching?.id ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    amount: input.amount,
    currency: input.currency,
  });

  await noteModuleUsage(context.db, context.organizationId, 'approvals');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVAL_REQUEST_SUBMITTED,
    entityType: 'approval_request',
    entityId: request.id,
    after: {
      entityType: request.entityType,
      entityId: request.entityId,
      amount: request.amount,
      currency: request.currency,
      ruleId: request.ruleId,
      status: request.status,
      currentStepOrder: request.currentStepOrder,
      totalSteps: request.totalSteps,
    },
  });

  return { kind: 'submitted', request };
}

/**
 * Domain finalize/issue gate. No matching rule → allow.
 * Approved latest request → allow.
 * Otherwise submit (optional) and block with DomainRuleError.
 *
 * Rule/request reads use 0029 SECURITY DEFINER helpers so domain actors without
 * approvals.read are still gated - without opening approval_rules to all members.
 *
 * Domain still does NOT force Changes/BOQ/Time into approval_requests.
 */
export async function assertApprovalAllowsAction(
  context: OrgContext,
  raw: {
    readonly entityType: SubmitApprovalRequestInput['entityType'];
    readonly entityId: string;
    readonly amount?: string | null;
    readonly currency?: string | null;
    readonly submitIfMissing?: boolean;
  },
): Promise<void> {
  // Gate runs inside already-authorized domain actions (finalize / issue).
  const rules = await listEnabledRulesForEntity(
    context.db,
    context.organizationId,
    raw.entityType,
  );
  const matching = selectMatchingRule(rules, {
    entityType: raw.entityType,
    amount: raw.amount,
    currency: raw.currency,
  });
  if (!matching) return;

  const latest = await findLatestRequestForEntityGate(
    context.db,
    context.organizationId,
    raw.entityType,
    raw.entityId,
  );
  if (
    latest?.status === 'approved' &&
    approvalCoversAmount({
      requestAmount: latest.amount,
      requestCurrency: latest.currency,
      currentAmount: raw.amount,
      currentCurrency: raw.currency,
    })
  ) {
    return;
  }

  if (latest?.status === 'submitted') {
    throw new DomainRuleError(
      'This action is waiting for approval',
      'approvals.errors.pending',
      { requestId: latest.id, entityType: raw.entityType, entityId: raw.entityId },
    );
  }

  if (latest?.status === 'rejected') {
    throw new DomainRuleError(
      'This action was rejected and cannot proceed',
      'approvals.errors.rejected',
      { requestId: latest.id, entityType: raw.entityType, entityId: raw.entityId },
    );
  }

  if (raw.submitIfMissing === false) {
    throw new DomainRuleError(
      'Approval is required before this action',
      'approvals.errors.required',
      { entityType: raw.entityType, entityId: raw.entityId },
    );
  }

  const submitted = await createSubmittedRequest(context, {
    ruleId: matching.id,
    entityType: raw.entityType,
    entityId: raw.entityId,
    amount: raw.amount,
    currency: raw.currency,
  });

  await noteModuleUsage(context.db, context.organizationId, 'approvals');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVAL_REQUEST_SUBMITTED,
    entityType: 'approval_request',
    entityId: submitted.id,
    after: {
      entityType: submitted.entityType,
      entityId: submitted.entityId,
      amount: submitted.amount,
      currency: submitted.currency,
      ruleId: submitted.ruleId,
      status: submitted.status,
      currentStepOrder: submitted.currentStepOrder,
      totalSteps: submitted.totalSteps,
      via: 'gate',
    },
  });

  throw new DomainRuleError(
    'Submitted for approval - waiting for a decision',
    'approvals.errors.submittedPending',
    { requestId: submitted.id, entityType: raw.entityType, entityId: raw.entityId },
  );
}

/**
 * Pure pre-check for create flows that need draft-vs-open before an entity id exists.
 * Uses the same SECURITY DEFINER rule loader as the gate.
 */
export async function findMatchingApprovalRule(
  context: OrgContext,
  input: {
    readonly entityType: SubmitApprovalRequestInput['entityType'];
    readonly amount?: string | null;
    readonly currency?: string | null;
  },
) {
  const rules = await listEnabledRulesForEntity(
    context.db,
    context.organizationId,
    input.entityType,
  );
  return selectMatchingRule(rules, {
    entityType: input.entityType,
    amount: input.amount,
    currency: input.currency,
  });
}
