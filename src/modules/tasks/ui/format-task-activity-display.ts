import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';

export type ActivityTranslate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveActivityEventLabelKey(
  eventType: string,
  payload?: Record<string, unknown> | null,
): `activity.${string}` {
  if (eventType === 'due_date_changed' && payload?.postponementOption) {
    return 'activity.employeePostponed';
  }
  return `activity.${eventType}` as `activity.${string}`;
}

export function localizeActivityScalar(
  field: string | undefined,
  raw: unknown,
  t: ActivityTranslate,
  locale: string,
): string {
  if (raw == null || raw === '') return '—';

  if (field === 'status' && typeof raw === 'string') {
    return t(`status.${raw}`);
  }
  if (field === 'priority' && typeof raw === 'string') {
    return t(`priority.${raw}`);
  }
  if (field === 'dueDate' && typeof raw === 'string') {
    const date = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
    }
  }

  return String(raw);
}

export function resolveActivityFieldLabel(field: string, t: ActivityTranslate): string {
  const key = `activity.fields.${field}` as const;
  try {
    return t(key);
  } catch {
    return field;
  }
}

export function formatActivityPayloadSummary(
  eventType: string,
  payload: Record<string, unknown> | null,
  t: ActivityTranslate,
  locale = 'en',
): string | null {
  if (!payload) return null;

  const action = payload.action as string | undefined;
  if (eventType === 'checklist_completed' && action) {
    if (action === 'added' && payload.title) {
      return t('activity.checklistAdded', { title: String(payload.title) });
    }
    if (action === 'completed' && payload.title) {
      return t('activity.checklistCompleted', { title: String(payload.title) });
    }
    if (action === 'reopened' && payload.title) {
      return t('activity.checklistReopened', { title: String(payload.title) });
    }
    if (action === 'removed' && payload.title) {
      return t('activity.checklistRemoved', { title: String(payload.title) });
    }
  }

  if (eventType === 'assigned' && action === 'removed') {
    return t('activity.assigneeRemoved');
  }

  if (
    (eventType === 'attachment_added' || eventType === 'attachment_removed') &&
    payload.filename
  ) {
    return String(payload.filename);
  }

  if (eventType === 'automation_changed') {
    const field = payload.field as string | undefined;
    if (field) {
      return resolveActivityFieldLabel(field, t);
    }
  }

  const assignedTo = payload.assignedToName as string | undefined;
  if (assignedTo) return assignedTo;

  if (eventType === 'dependency_added' || eventType === 'dependency_removed') {
    const title = payload.targetTaskTitle as string | undefined;
    if (title) return t('activity.dependencyTarget', { title });
  }

  if (eventType === 'task_duplicated') {
    const title = payload.newTaskTitle as string | undefined;
    if (title) return t('activity.duplicateTarget', { title });
  }

  if (eventType === 'template_saved') {
    const title = payload.templateTitle as string | undefined;
    if (title) return t('activity.templateName', { title });
  }

  if (eventType === 'task_from_template') {
    const title = payload.templateTitle as string | undefined;
    if (title) return t('activity.templateName', { title });
  }

  if (eventType === 'subtask_added') {
    const title = payload.subtaskTitle as string | undefined;
    if (title) return t('activity.subtaskName', { title });
  }

  if (eventType === 'due_date_changed' && payload.postponementOption) {
    const from = localizeActivityScalar('dueDate', payload.from, t, locale);
    const to = localizeActivityScalar('dueDate', payload.to, t, locale);
    let summary = t('activity.employeePostponedFromTo', { from, to });
    const reason = payload.reason as string | undefined;
    if (reason?.trim()) {
      summary = `${summary} ${t('activity.employeePostponedReason', { reason: reason.trim() })}`;
    }
    return summary;
  }

  return null;
}

export function formatActivityDiff(
  eventType: string,
  payload: Record<string, unknown> | null,
  t: ActivityTranslate,
  locale: string,
): { from: string; to: string } | null {
  if (!payload || !isRecord(payload)) return null;

  if (eventType === 'due_date_changed' && payload.postponementOption) {
    return null;
  }

  const from = payload.from;
  const to = payload.to;
  if (from === undefined && to === undefined) return null;

  const field =
    eventType === 'automation_changed'
      ? (payload.field as string | undefined)
      : eventType === 'status_changed'
        ? 'status'
        : eventType === 'priority_changed'
          ? 'priority'
          : eventType === 'due_date_changed'
            ? 'dueDate'
            : undefined;

  return {
    from: localizeActivityScalar(field, from, t, locale),
    to: localizeActivityScalar(field, to, t, locale),
  };
}
