'use client';

import { useTranslations } from 'next-intl';
import type { Boq, BoqLine, CatalogType } from '../domain/contracts';
import { boqLineDisplayLabel, boqLineStatus } from './boq-display';

export function TakeoffBoqPanel({
  boq,
  lines,
  catalog,
  focusKey,
  onLineClick,
  suppressVerified,
  showUnclassified,
  onToggleUnclassified,
}: {
  boq: Boq;
  lines: readonly BoqLine[];
  catalog: readonly CatalogType[];
  focusKey: string | null;
  onLineClick: (lineKey: string, detectionIds: string[]) => void;
  /** When worker warnings block verification, never show “verified” badges. */
  suppressVerified?: boolean;
  showUnclassified?: boolean;
  onToggleUnclassified?: () => void;
}) {
  const t = useTranslations('takeoff');
  const classifiedQty = boq.lines.filter((l) => l.typeKey != null && !l.excluded).reduce((s, l) => s + l.quantity, 0);
  const unclassifiedLabel = t('detection.unclassified');

  const statusLabel = (line: BoqLine) => {
    const status = boqLineStatus(line, Boolean(suppressVerified));
    if (status === 'verified') return t('boq.statusVerified');
    if (status === 'needsReview') return t('boq.statusNeedsReview');
    return t('boq.statusForReview');
  };

  return (
    <div
      className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-lg border border-[var(--pf-border-default)]"
      data-testid="takeoff-boq-panel"
    >
      <header className="border-b border-[var(--pf-border-default)] px-3 py-2">
        <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('boq.title')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('boq.classifiedSummary', {
            lines: boq.lines.filter((l) => l.typeKey != null).length,
            quantity: classifiedQty,
          })}
        </p>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('boq.summary', { unclassified: boq.unclassifiedCount, review: boq.needsReviewCount })}
        </p>
        {boq.unclassifiedCount > 0 && onToggleUnclassified ? (
          <button
            type="button"
            className="mt-1 text-xs text-[var(--pf-text-brand)] underline"
            onClick={onToggleUnclassified}
          >
            {showUnclassified ? t('boq.hideUnclassified') : t('boq.showUnclassified', { count: boq.unclassifiedCount })}
          </button>
        ) : null}
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <table className="w-full min-w-0 table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-[1] bg-[var(--pf-bg-surface)]">
            <tr className="border-b border-[var(--pf-border-default)] text-xs text-[var(--pf-text-muted)]">
              <th scope="col" className="px-2 py-2 text-start font-medium">
                {t('boq.columnType')}
              </th>
              <th scope="col" className="w-16 px-2 py-2 text-end font-medium">
                {t('boq.columnQuantity')}
              </th>
              <th scope="col" className="w-[7.5rem] px-2 py-2 text-start font-medium">
                {t('boq.columnStatus')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-3 text-xs text-[var(--pf-text-muted)]">
                  {t('boq.empty')}
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const displayName = boqLineDisplayLabel(line, catalog, unclassifiedLabel);
                const status = statusLabel(line);
                return (
                  <tr key={line.key}>
                    <td className="p-0">
                      <button
                        type="button"
                        data-testid={line.typeKey == null ? 'takeoff-boq-line-unclassified' : 'takeoff-boq-line'}
                        className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-[var(--pf-action-subtle-hover)] ${
                          focusKey === line.key ? 'bg-[var(--pf-action-subtle-active)]' : ''
                        }`}
                        onClick={() => onLineClick(line.key, line.detectionIds)}
                      >
                        <span className="min-w-0 truncate font-medium text-[var(--pf-text-primary)]">{displayName}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-end align-middle font-semibold tabular-nums text-[var(--pf-text-brand)]">
                      {line.quantity}
                    </td>
                    <td className="px-2 py-2 align-middle text-xs text-[var(--pf-text-secondary)]">{status}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}