'use client';

import { useTranslations } from 'next-intl';
import type { Boq, BoqLine, CatalogType } from '../domain/contracts';
import { boqLineDisplayLabel, boqLineStatus, groupBoqLinesForDisplay } from './boq-display';

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
  const displayLines = groupBoqLinesForDisplay(lines, catalog, unclassifiedLabel, Boolean(suppressVerified));

  const statusLabel = (line: BoqLine) => {
    const status = boqLineStatus(line, Boolean(suppressVerified));
    if (status === 'verified') return t('boq.statusVerified');
    if (status === 'needsReview') return t('boq.statusNeedsReview');
    return t('boq.statusForReview');
  };

  return (
    <div
      className="flex min-w-0 max-w-full flex-col rounded-lg border border-[var(--pf-border-default)]"
      data-testid="takeoff-boq-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--pf-border-default)] px-2 py-1">
        <p className="text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-boq-counting">
          {t('boq.countedShort', { count: boq.counting?.countedTotal ?? classifiedQty })}
        </p>
        {boq.unclassifiedCount > 0 && onToggleUnclassified ? (
          <button
            type="button"
            className="shrink-0 text-xs text-[var(--pf-text-brand)] underline"
            onClick={onToggleUnclassified}
          >
            {showUnclassified ? t('boq.hideUnclassified') : t('boq.showUnclassified', { count: boq.unclassifiedCount })}
          </button>
        ) : null}
      </header>
      <div className="min-w-0">
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
            {displayLines.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-3 text-xs text-[var(--pf-text-muted)]">
                  {t('boq.empty')}
                </td>
              </tr>
            ) : (
              displayLines.map((line) => {
                const displayName = boqLineDisplayLabel(line, catalog, unclassifiedLabel);
                const status = statusLabel(line);
                const tone = boqLineStatus(line, Boolean(suppressVerified));
                const toneClass =
                  tone === 'verified'
                    ? 'bg-[var(--pf-status-success-bg)] text-[var(--pf-status-success-fg)]'
                    : tone === 'needsReview'
                      ? 'bg-[var(--pf-status-warning-bg)] text-[var(--pf-status-warning-fg)]'
                      : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]';
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
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: line.typeKey
                              ? (catalog.find((c) => c.key === line.typeKey)?.colorHex ?? '#64748b')
                              : '#94a3b8',
                          }}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate font-medium text-[var(--pf-text-primary)]">{displayName}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-end align-middle font-semibold tabular-nums text-[var(--pf-text-brand)]">
                      {line.quantity}
                      {line.symbolCount != null && line.symbolCount !== line.quantity ? (
                        <span className="block text-xs font-normal text-[var(--pf-text-secondary)]">
                          {t('boq.symbolCount', { count: line.symbolCount })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 align-middle text-xs">
                      <span className={`inline-flex rounded px-1.5 py-0.5 ${toneClass}`}>{status}</span>
                    </td>
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