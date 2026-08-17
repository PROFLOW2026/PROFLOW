import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AUTOMATION_PRESET_KEYS, type AutomationPresetKey, type AutomationRuleRecord, type AutomationRunRecord } from '../domain/types';
import {
  listAutomationRules,
  listAutomationRuns,
  upsertAutomationRule,
} from '../data/automations.repository';
import { setAutomationRuleSchema, type SetAutomationRuleInput } from '../validation/schemas';

function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export interface AutomationPresetView {
  readonly presetKey: AutomationPresetKey;
  readonly enabled: boolean;
  readonly ruleId: string | null;
}

export async function listAutomationPresets(context: OrgContext): Promise<{
  readonly presets: readonly AutomationPresetView[];
  readonly runs: readonly AutomationRunRecord[];
}> {
  assertPermission(context, PERMISSIONS.AUTOMATIONS_READ);
  const rules = await listAutomationRules(context.db, context.organizationId).catch(
    () => [] as AutomationRuleRecord[],
  );
  const byKey = new Map(rules.map((rule) => [rule.presetKey, rule]));
  const presets = AUTOMATION_PRESET_KEYS.map((presetKey) => {
    const rule = byKey.get(presetKey);
    return {
      presetKey,
      enabled: rule?.enabled ?? false,
      ruleId: rule?.id ?? null,
    };
  });
  const runs = await listAutomationRuns(context.db, context.organizationId, { limit: 40 }).catch(
    () => [] as AutomationRunRecord[],
  );
  return { presets, runs };
}

export async function setAutomationRuleEnabled(
  context: OrgContext,
  raw: SetAutomationRuleInput,
): Promise<AutomationRuleRecord> {
  assertPermission(context, PERMISSIONS.AUTOMATIONS_MANAGE);
  const input = parseOrThrow(setAutomationRuleSchema.safeParse(raw));
  const rule = await upsertAutomationRule(context.db, {
    organizationId: context.organizationId,
    presetKey: input.presetKey,
    enabled: input.enabled,
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AUTOMATION_RULE_UPDATED,
    entityType: 'automation_rule',
    entityId: rule.id,
    after: { presetKey: rule.presetKey, enabled: rule.enabled },
  });
  return rule;
}
