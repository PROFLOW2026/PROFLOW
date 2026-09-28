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

export type CaptureNotificationVariant =
  | 'field_media'
  | 'financial_document'
  | 'video'
  | 'default';

export type MaterialPressureAlertReason = 'high_pressure' | 'significant_delta';

export type MaterialPressureAlertTrade =
  | 'electrical'
  | 'plumbing'
  | 'steel_rebar'
  | 'concrete';

function materialPressureTradeLabel(
  t: NotificationCopyTranslator,
  trade: MaterialPressureAlertTrade,
): string {
  const key = `copy.material_pressure_alert.trades.${trade}`;
  return t.has(key) ? t(key) : trade;
}

export function materialPressureAlertNotificationCopy(
  t: NotificationCopyTranslator,
  input: {
    readonly trade: MaterialPressureAlertTrade;
    readonly score: number;
    readonly delta: number | null;
    readonly reason: MaterialPressureAlertReason;
  },
): { title: string; body: string } {
  const tradeLabel = materialPressureTradeLabel(t, input.trade);
  const titleKey =
    input.reason === 'high_pressure'
      ? 'copy.material_pressure_alert.titleHigh'
      : 'copy.material_pressure_alert.titleRising';

  const title = t(titleKey, { trade: tradeLabel, score: input.score });

  const deltaSuffix =
    input.delta != null
      ? t('copy.material_pressure_alert.deltaSuffix', {
          delta: `${input.delta > 0 ? '+' : ''}${input.delta.toFixed(1)}`,
        })
      : '';

  const body = t('copy.material_pressure_alert.body', {
    trade: tradeLabel,
    score: input.score,
    deltaSuffix,
  });

  return { title, body };
}

export function captureNeedsReviewNotificationCopy(
  t: NotificationCopyTranslator,
  variant: CaptureNotificationVariant,
  ownerNote?: string | null,
): { title: string; body: string } {
  const extra = ownerNote?.trim() || null;
  const prefix = `copy.capture_needs_review.variants.${variant}`;
  const title = t(`${prefix}.titleDefault`);
  const body = extra
    ? t(`${prefix}.bodyWithExtra`, { extra })
    : t(`${prefix}.bodyDefault`);
  return { title, body };
}

export function taskPostponedByEmployeeNotificationCopy(
  t: NotificationCopyTranslator,
  input: {
    readonly employeeName: string;
    readonly taskTitle: string;
    readonly fromDate: string;
    readonly toDate: string;
    readonly reason?: string | null;
  },
): { title: string; body: string } {
  const title = t('copy.task_postponed_by_employee.title', {
    employeeName: input.employeeName,
  });
  let body = t('copy.task_postponed_by_employee.body', {
    taskTitle: input.taskTitle,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });
  const reason = input.reason?.trim();
  if (reason) {
    body = `${body}\n${t('copy.task_postponed_by_employee.reasonSuffix', { reason })}`;
  }
  return { title, body };
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
    case 'capture_needs_review':
      return captureNeedsReviewNotificationCopy(t, 'default', extra);
    case 'task_status_updated':
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
    case 'task_postponed_by_employee':
      return {
        title: t('copy.task_postponed_by_employee.titleDefault'),
        body: t('copy.task_postponed_by_employee.bodyDefault'),
      };
    case 'material_pressure_alert':
      // Pressure alerts are emitted directly by the ops-worker with pre-built title/body.
      // This copy helper is not used for that path, but the case must be present for exhaustiveness.
      return {
        title: titleWithReference(t, type, ref),
        body: bodyWithExtra(t, type, extra),
      };
  }
}
