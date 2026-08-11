import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findApprovalRuleById,
  insertApprovalRule,
  listApprovalRulesForOrg,
  updateApprovalRuleRow,
} from '../data/approvals.repository';
import {
  createApprovalRuleSchema,
  updateApprovalRuleSchema,
  type CreateApprovalRuleInput,
  type UpdateApprovalRuleInput,
} from '../validation/schemas';

export async function listApprovalRules(context: OrgContext) {
  assertPermission(context, PERMISSIONS.APPROVALS_READ);
  return listApprovalRulesForOrg(context.db, context.organizationId);
}

export async function createApprovalRule(context: OrgContext, raw: CreateApprovalRuleInput) {
  assertPermission(context, PERMISSIONS.APPROVALS_MANAGE);

  const parsed = createApprovalRuleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const rule = await insertApprovalRule(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    entityType: input.entityType,
    thresholdAmount: input.thresholdAmount ?? null,
    currency: input.currency ?? null,
    enabled: input.enabled ?? true,
  });

  await noteModuleUsage(context.db, context.organizationId, 'approvals');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVAL_RULE_CREATED,
    entityType: 'approval_rule',
    entityId: rule.id,
    after: {
      name: rule.name,
      entityType: rule.entityType,
      thresholdAmount: rule.thresholdAmount,
      currency: rule.currency,
      enabled: rule.enabled,
    },
  });

  return rule;
}

export async function updateApprovalRule(context: OrgContext, raw: UpdateApprovalRuleInput) {
  assertPermission(context, PERMISSIONS.APPROVALS_MANAGE);

  const parsed = updateApprovalRuleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findApprovalRuleById(context.db, context.organizationId, input.ruleId);
  if (!existing) throw new NotFoundError('Approval rule');

  const updated = await updateApprovalRuleRow(context.db, context.organizationId, input.ruleId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.thresholdAmount !== undefined ? { thresholdAmount: input.thresholdAmount } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  });
  if (!updated) throw new NotFoundError('Approval rule');

  await noteModuleUsage(context.db, context.organizationId, 'approvals');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVAL_RULE_UPDATED,
    entityType: 'approval_rule',
    entityId: updated.id,
    before: {
      name: existing.name,
      thresholdAmount: existing.thresholdAmount,
      currency: existing.currency,
      enabled: existing.enabled,
    },
    after: {
      name: updated.name,
      thresholdAmount: updated.thresholdAmount,
      currency: updated.currency,
      enabled: updated.enabled,
    },
  });

  return updated;
}
