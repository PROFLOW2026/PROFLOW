import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';
import type { NotificationEventType } from './types';

export type NotificationCopyTranslator = NamespaceTranslator;

function titleWithReference(
  t: NotificationCopyTranslator,
  type: NotificationEventType,
  reference: string | null,
): string {
  if (reference) {
    return t(`copy.${type}.titleWithReference`, { reference });
  }
  return t(`copy.${type}.titleDefault`);
}

function bodyWithExtra(
  t: NotificationCopyTranslator,
  type: NotificationEventType,
  extra: string | null,
  defaultKey: 'bodyDefault' | 'body' = 'bodyDefault',
  extraKey = 'bodyWithExtra',
): string {
  if (extra) {
    return t(`copy.${type}.${extraKey}`, { extra });
  }
  return t(`copy.${type}.${defaultKey}`);
}

export function notificationCopy(
  t: NotificationCopyTranslator,
  type: NotificationEventType,
  input: { readonly reference?: string | null; readonly extra?: string | null },
): { title: string; body: string } {
  const ref = input.reference?.trim() || null;
  const extra = input.extra?.trim() || null;

  switch (type) {
    case 'billing_overdue':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'ap_due_soon':
    case 'ap_overdue':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'approval_waiting':
      return {
        title: t('copy.approval_waiting.title'),
        body: ref
          ? t('copy.approval_waiting.bodyWithReference', { reference: ref })
          : t('copy.approval_waiting.bodyDefault'),
      };
    case 'timesheet_waiting':
      return {
        title: t('copy.timesheet_waiting.title'),
        body: bodyWithExtra(t, type, extra),
      };
    case 'employee_missing_report':
      return {
        title: t('copy.employee_missing_report.title'),
        body: t('copy.employee_missing_report.body'),
      };
    case 'document_expiring':
    case 'task_overdue':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'boq_awaiting_approval':
      return {
        title: t('copy.boq_awaiting_approval.title'),
        body: bodyWithExtra(t, type, extra, 'bodyDefault', 'bodyWithExtra'),
      };
    case 'work_order_assigned':
    case 'punch_assigned':
      return {
        title: titleWithReference(t, type, ref),
        body: t(`copy.${type}.body`),
      };
    case 'low_stock':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra, 'bodyDefault', 'bodyWithExtra'),
      };
    case 'safety_action_due':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'warranty_expiring':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'closeout_blockers':
    case 'communication_failed':
    case 'automation_output':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra, 'bodyDefault', 'bodyWithExtra'),
      };
    case 'billing_plan_cycle_draft':
    case 'billing_plan_milestone_due':
    case 'billing_plan_retention_held':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'action_required':
      return {
        title: ref ? t('copy.action_required.titleWithReference', { reference: ref }) : t('copy.action_required.titleDefault'),
        body: bodyWithExtra(t, type, extra, 'bodyDefault', 'bodyWithExtra'),
      };
    // ── Universal Work Management notifications ────────────────────────────
    case 'task_assigned_to_you':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'task_comment_mention':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'task_due_soon':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'task_approval_requested':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'task_approval_decided':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra, 'bodyDefault', 'bodyWithExtra'),
      };
    case 'task_dependency_resolved':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'milestone_approaching':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
  }
}
