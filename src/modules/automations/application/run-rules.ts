import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { emitNotification } from '@/modules/notifications';
import { saveCommunicationDraft } from '@/modules/communications/application/manage';
import {
  AUTOMATION_PRESET_KEYS,
  type AutomationActionRequest,
  type AutomationPresetKey,
  type AutomationRunRecord,
} from '../domain/types';
import {
  assertSafeAutomationAction,
  defaultActionsForPreset,
  filterExecutableActions,
  isUnsafeAutomationAction,
} from '../domain/safe-actions';
import {
  insertAutomationRun,
  listAutomationRules,
  upsertAutomationRule,
} from '../data/automations.repository';
import { collectPresetMatches } from './collect-matches';
import { runAutomationsSchema, type RunAutomationsInput } from '../validation/schemas';

function projectIdsFromMatches(
  matches: Awaited<ReturnType<typeof collectPresetMatches>>,
): string[] {
  return [...new Set(matches.map((match) => match.projectId).filter((id): id is string => Boolean(id)))];
}

function accessScopeForMatches(
  matches: Awaited<ReturnType<typeof collectPresetMatches>>,
): { projectIds: string[] } {
  return { projectIds: projectIdsFromMatches(matches) };
}

const NOTIFY_CAP = 12;

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

function notificationTypeForPreset(presetKey: AutomationPresetKey) {
  switch (presetKey) {
    case 'client_balance_overdue':
      return 'billing_overdue' as const;
    case 'vendor_bill_due':
      return 'ap_overdue' as const;
    case 'timesheet_waiting_approval':
      return 'timesheet_waiting' as const;
    case 'timesheet_not_submitted':
      return 'employee_missing_report' as const;
    case 'compliance_expiring':
    case 'warranty_expiring':
      return 'document_expiring' as const;
    default:
      return 'task_overdue' as const;
  }
}

function actionsFromConfig(config: Record<string, unknown>): AutomationActionRequest[] {
  const raw = config.actions;
  if (!Array.isArray(raw) || raw.length === 0) return [...defaultActionsForPreset()];
  return raw
    .map((item) => {
      if (typeof item === 'string') return { kind: item };
      if (item && typeof item === 'object' && 'kind' in item && typeof item.kind === 'string') {
        return { kind: item.kind, payload: item as Record<string, unknown> };
      }
      return null;
    })
    .filter((item): item is AutomationActionRequest => item !== null);
}

async function executeSafeAction(
  context: OrgContext,
  presetKey: AutomationPresetKey,
  action: AutomationActionRequest,
  matches: Awaited<ReturnType<typeof collectPresetMatches>>,
): Promise<{ kind: string; count: number }> {
  assertSafeAutomationAction(action.kind);
  if (action.kind === 'notify') {
    let count = 0;
    for (const match of matches.slice(0, NOTIFY_CAP)) {
      await emitNotification(context, {
        recipientUserId: context.userId,
        type: notificationTypeForPreset(presetKey),
        title: match.title,
        body: match.body,
        dedupeKey: `automation:${presetKey}:${match.entityType}:${match.entityId}`,
        severity: 'warning',
        entityType: match.entityType,
        entityId: match.entityId,
        deepLink: match.href,
      });
      count += 1;
    }
    return { kind: 'notify', count };
  }
  if (action.kind === 'draft_communication') {
    if (!hasPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE)) {
      return { kind: 'draft_communication', count: 0 };
    }
    const match = matches[0];
    if (!match) return { kind: 'draft_communication', count: 0 };
    await saveCommunicationDraft(context, {
      relatedEntityType: 'other',
      relatedEntityId: match.entityId,
      recipientEmail: 'draft@invalid.local',
      subject: match.title,
      bodyText: match.body,
    });
    return { kind: 'draft_communication', count: 1 };
  }
  if (action.kind === 'draft_expense' || action.kind === 'planning_followup') {
    return { kind: action.kind, count: 0 };
  }
  return { kind: action.kind, count: 0 };
}

export interface RunRulesResult {
  readonly runs: readonly AutomationRunRecord[];
  readonly refusedUnsafe: readonly string[];
}

/**
 * Permission-gated rule runner. Tests and explicit UI "Run now" call this.
 * Does not register a production cron.
 */
export async function runRules(
  context: OrgContext,
  raw: RunAutomationsInput = {},
): Promise<RunRulesResult> {
  assertPermission(context, PERMISSIONS.AUTOMATIONS_MANAGE);
  const input = parseOrThrow(runAutomationsSchema.safeParse(raw));

  let rules = await listAutomationRules(context.db, context.organizationId).catch(() => []);
  if (input.presetKey) {
    let rule = rules.find((item) => item.presetKey === input.presetKey) ?? null;
    if (!rule) {
      rule = await upsertAutomationRule(context.db, {
        organizationId: context.organizationId,
        presetKey: input.presetKey,
        enabled: true,
        createdByUserId: context.userId,
      });
    }
    rules = [rule];
  } else {
    rules = rules.filter((item) => item.enabled);
  }

  const runs: AutomationRunRecord[] = [];
  const refusedUnsafe: string[] = [];

  for (const rule of rules) {
    if (!AUTOMATION_PRESET_KEYS.includes(rule.presetKey)) continue;
    const requested = actionsFromConfig(rule.configJson);
    if (requested.some((item) => isUnsafeAutomationAction(item.kind))) {
      const unsafe = requested.filter((item) => isUnsafeAutomationAction(item.kind)).map((item) => item.kind);
      refusedUnsafe.push(...unsafe);
      const failed = await insertAutomationRun(context.db, {
        organizationId: context.organizationId,
        ruleId: rule.id,
        status: 'failed',
        actionsJson: { refused: unsafe },
        errorMessage: 'Unsafe action refused',
        accessScopeJson: {},
      });
      runs.push(failed);
      continue;
    }

    const { allowed, refused } = filterExecutableActions(requested);
    if (refused.length > 0) {
      refusedUnsafe.push(...refused);
      const failed = await insertAutomationRun(context.db, {
        organizationId: context.organizationId,
        ruleId: rule.id,
        status: 'failed',
        actionsJson: { refused },
        errorMessage: 'Unsafe action refused',
        accessScopeJson: {},
      });
      runs.push(failed);
      continue;
    }

    try {
      const matches = await collectPresetMatches(context, rule.presetKey);
      if (matches.length === 0) {
        const skipped = await insertAutomationRun(context.db, {
          organizationId: context.organizationId,
          ruleId: rule.id,
          status: 'skipped',
          actionsJson: { matches: 0 },
          errorMessage: null,
          accessScopeJson: {},
        });
        runs.push(skipped);
        continue;
      }

      const executed = [];
      for (const action of allowed) {
        executed.push(await executeSafeAction(context, rule.presetKey, action, matches));
      }
      const ok = await insertAutomationRun(context.db, {
        organizationId: context.organizationId,
        ruleId: rule.id,
        status: 'ok',
        actionsJson: { matches: matches.length, executed },
        errorMessage: null,
        accessScopeJson: accessScopeForMatches(matches),
      });
      runs.push(ok);
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.AUTOMATION_RULE_RAN,
        entityType: 'automation_rule',
        entityId: rule.id,
        after: { presetKey: rule.presetKey, status: 'ok', matchCount: matches.length },
      });
    } catch (error) {
      if (error instanceof DomainRuleError) {
        refusedUnsafe.push(String(error.details?.action ?? 'unsafe'));
      }
      const failed = await insertAutomationRun(context.db, {
        organizationId: context.organizationId,
        ruleId: rule.id,
        status: 'failed',
        actionsJson: [],
        errorMessage: error instanceof Error ? error.message : 'failed',
        accessScopeJson: {},
      });
      runs.push(failed);
    }
  }

  return { runs, refusedUnsafe };
}
