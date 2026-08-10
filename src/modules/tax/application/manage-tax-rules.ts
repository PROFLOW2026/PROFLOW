import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaxRuleById,
  insertOrgTaxRule,
  updateOrgTaxRule as patchOrgTaxRule,
} from '../data/tax-rules.repository';
import { createTaxRuleSchema, updateTaxRuleSchema, type CreateTaxRuleInput, type UpdateTaxRuleInput } from '../validation/schemas';

const TAX_RULE_CREATED = AUDIT_ACTIONS.TAX_RULE_CREATED;
const TAX_RULE_UPDATED = AUDIT_ACTIONS.TAX_RULE_UPDATED;

export async function createOrgTaxRule(context: OrgContext, rawInput: CreateTaxRuleInput) {
  assertPermission(context, PERMISSIONS.TAX_MANAGE);

  const parsed = createTaxRuleSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const validTo = input.validTo?.trim() ? businessDate(input.validTo) : null;

  const rule = await insertOrgTaxRule(context.db, {
    organizationId: context.organizationId,
    countryCode: context.organization.countryCode,
    key: input.key,
    name: input.name,
    method: input.method,
    ratePercent: input.method === 'percentage' ? input.ratePercent!.trim() : null,
    validFrom: businessDate(input.validFrom),
    validTo,
    isDefault: input.isDefault,
  });

  await recordAuditEvent(context, {
    action: TAX_RULE_CREATED,
    entityType: 'tax_rule',
    entityId: rule.id,
    after: {
      key: rule.key,
      name: rule.name,
      ratePercent: rule.ratePercent,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
    },
  });

  return rule;
}

export async function updateOrgTaxRule(context: OrgContext, rawInput: UpdateTaxRuleInput) {
  assertPermission(context, PERMISSIONS.TAX_MANAGE);

  const parsed = updateTaxRuleSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findTaxRuleById(context.db, context.organizationId, input.ruleId);
  if (!existing) throw new NotFoundError('Tax rule');

  if (existing.organizationId === null) {
    throw new DomainRuleError(
      'Country pack rules cannot be edited',
      'errors.notAllowed',
      { ruleId: input.ruleId },
    );
  }

  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.ratePercent !== undefined ? { ratePercent: input.ratePercent } : {}),
    ...(input.validFrom !== undefined ? { validFrom: businessDate(input.validFrom) } : {}),
    ...(input.validTo !== undefined
      ? { validTo: input.validTo?.trim() ? businessDate(input.validTo) : null }
      : {}),
    ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
  };

  const updated = await patchOrgTaxRule(context.db, context.organizationId, input.ruleId, patch);
  if (!updated) throw new NotFoundError('Tax rule');

  await recordAuditEvent(context, {
    action: TAX_RULE_UPDATED,
    entityType: 'tax_rule',
    entityId: updated.id,
    before: {
      name: existing.name,
      ratePercent: existing.ratePercent,
      validFrom: existing.validFrom,
      validTo: existing.validTo,
    },
    after: {
      name: updated.name,
      ratePercent: updated.ratePercent,
      validFrom: updated.validFrom,
      validTo: updated.validTo,
    },
  });

  return updated;
}
