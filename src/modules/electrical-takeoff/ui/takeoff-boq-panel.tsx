'use client';

import { useTranslations } from 'next-intl';
import type { Boq, BoqLine } from '../domain/contracts';

export function TakeoffBoqPanel({
  boq,
  lines,
  focusKey,
  onLineClick,
  suppressVerified,
}: {
  boq: Boq;
  lines: readonly BoqLine[];
  focusKey: string | null;
  onLineClick: (lineKey: string, detectionIds: string[]) => void;
  /** When worker warnings block verification, never show “verified” badges. */
  suppressVerified?: boolean;
}) {
  const t = useTranslations('takeoff');

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-lg border border-[var(--pf-border-default)]">
      <header className="border-b border-[var(--pf-border-default)] px-3 py-2">
        <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('boq.title')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('boq.summary', { unclassified: boq.unclassifiedCount, review: boq.needsReviewCount })}
        </p>
        {boq.counting ? (
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-boq-counting">
            {t('boq.countingSummary', {
              counted: boq.counting.countedTotal,
              pdf: boq.counting.countedBySource.pdf,
              dwg: boq.counting.countedBySource.dwg,
              merged: boq.counting.countedBySource.merged,
              pdfOnly: boq.counting.excluded.pdfOnly,
              legend: boq.counting.excluded.legendZone,
              twins: boq.counting.twinsCollapsed ?? 0,
              sheetExcluded: boq.counting.excluded.sheetExcluded ?? 0,
            })}
          </p>
        ) : null}
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
        {lines.length === 0 ? (
          <li className="p-3 text-xs text-[var(--pf-text-muted)]">{t('boq.empty')}</li>
        ) : (
          lines.map((line) => (
            <li key={line.key}>
              <button
                type="button"
                className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-[var(--pf-action-subtle-hover)] ${
                  focusKey === line.key ? 'bg-[var(--pf-action-subtle-active)]' : ''
                }`}
                onClick={() => onLineClick(line.key, line.detectionIds)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--pf-text-primary)]">{line.label}</span>
                  <span className="text-xs text-[var(--pf-text-muted)]">
                    {line.verified && !suppressVerified ? t('boq.verified') : t('boq.suggested')}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--pf-text-brand)]">
                  {line.quantity} {line.unit}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}