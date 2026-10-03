import type { NotificationCopyTranslator } from './copy';

/**
 * Developer / GC notification copy. Rows store `copyKey` + params (never rendered sentences), so
 * each reader sees the text in their own locale: `notifications.dg.copy.<copyKey>.{title,body}`.
 */

export interface DgCopyParams {
  readonly project?: string | null;
  readonly contractor?: string | null;
  readonly reference?: string | null;
}

export interface DgNotificationMetadata {
  readonly copyKey: string;
  readonly eventType: string;
  readonly params: DgCopyParams;
  readonly occurrences: number;
  readonly lastEventId: string | null;
}

const COPY_KEY = /^[a-z][a-z0-9_]*$/;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readDgNotificationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): DgNotificationMetadata | null {
  const raw = metadata?.dg;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const copyKey = text(record.copyKey);
  if (!copyKey || !COPY_KEY.test(copyKey)) return null;
  const params = (record.params && typeof record.params === 'object' ? record.params : {}) as Record<
    string,
    unknown
  >;
  const occurrences = Number(record.occurrences);
  return {
    copyKey,
    eventType: text(record.eventType) ?? copyKey,
    params: {
      project: text(params.project),
      contractor: text(params.contractor),
      reference: text(params.reference),
    },
    occurrences: Number.isFinite(occurrences) && occurrences > 1 ? Math.floor(occurrences) : 1,
    lastEventId: text(record.lastEventId),
  };
}

export function hasDgNotificationCopy(t: NotificationCopyTranslator, copyKey: string): boolean {
  return COPY_KEY.test(copyKey) && t.has(`dg.copy.${copyKey}.title`) && t.has(`dg.copy.${copyKey}.body`);
}

export function renderDgNotificationCopy(
  t: NotificationCopyTranslator,
  input: {
    readonly copyKey: string;
    readonly params: DgCopyParams;
    readonly occurrences?: number;
  },
): { title: string; body: string } {
  if (!hasDgNotificationCopy(t, input.copyKey)) {
    return { title: t('dg.genericTitle'), body: t('dg.genericBody') };
  }
  const base = `dg.copy.${input.copyKey}`;
  const plainTitle = t(`${base}.title`);
  const occurrences = input.occurrences ?? 1;
  const title = occurrences > 1 ? t('dg.repeated', { title: plainTitle, count: occurrences }) : plainTitle;
  const body = t(`${base}.body`);
  const context = [input.params.reference, input.params.project, input.params.contractor]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  return { title, body: context ? t('dg.bodyWithContext', { body, context }) : body };
}
