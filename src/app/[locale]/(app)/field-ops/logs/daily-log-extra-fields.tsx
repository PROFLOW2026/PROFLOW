'use client';

import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { DailyLogRecord } from '@/modules/field-ops/domain/types';

const EXTRA_KEYS = [
  'workersOnSite',
  'subcontractorsOnSite',
  'equipmentOnSite',
  'deliveries',
  'delays',
  'incidents',
  'safetyNotes',
  'visitorNotes',
  'managerNotes',
] as const;

export type DailyLogExtraKey = (typeof EXTRA_KEYS)[number];

export function dailyLogHasExtraValues(
  log?: Pick<DailyLogRecord, DailyLogExtraKey> | null,
): boolean {
  if (!log) return false;
  return EXTRA_KEYS.some((key) => Boolean(log[key]));
}

export function DailyLogExtraFields({
  log,
  fieldErrors,
  defaultOpen,
}: {
  log?: Pick<DailyLogRecord, DailyLogExtraKey> | null;
  fieldErrors?: Record<string, string>;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('fieldOps.extraFields');
  const open = defaultOpen ?? dailyLogHasExtraValues(log);

  return (
    <details
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
      open={open || undefined}
    >
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        {t('title')}
        <span className="mt-1 block text-xs font-normal text-[var(--pf-text-secondary)]">
          {t('hint')}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] px-4 py-4">
        {EXTRA_KEYS.map((key) => (
          <Field key={key} label={t(key)} error={fieldErrors?.[key]}>
            {(control) => (
              <Textarea
                {...control}
                name={key}
                rows={2}
                defaultValue={log?.[key] ?? ''}
                className="min-h-16 text-base"
              />
            )}
          </Field>
        ))}
      </div>
    </details>
  );
}
