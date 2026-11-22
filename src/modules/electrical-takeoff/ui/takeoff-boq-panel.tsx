'use client';

import { useTranslations } from 'next-intl';
import { cadHtmlTextLine } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-text-bidi';
import type { Boq, BoqLine, CatalogType, EffectiveDetection, SheetDto } from '../domain/contracts';
import { boqLineApprovalCounts, boqLineDisplayLabel, boqLineStatus, groupBoqLinesForDisplay } from './boq-display';
import { TakeoffSymbolGlyph } from './takeoff-symbol-glyph';
import { detectionIdentityStatus } from '../domain/review-copy';
import { boqQuantityDisplay, classifyLegendText, isUndeterminedQuantityLine } from '../domain/legend-identity';

function identityCopyKey(source: string | undefined): 'identityLegend' | 'identityCatalog' | 'identityLibrary' | 'identityManual' | null {
  if (source === 'legend') return 'identityLegend';
  if (source === 'catalog') return 'identityCatalog';
  if (source === 'library') return 'identityLibrary';
  if (source === 'manual') return 'identityManual';
  return null;
}

function glyphKey(detection: Pick<EffectiveDetection, 'id' | 'signature'>): string {
  return detection.signature ? `sig:${detection.signature}` : detection.id;
}

export function TakeoffBoqPanel({
  boq,
  lines,
  catalog,
  detections = [],
  sheets = [],
  glyphByKey = {},
  focusKey,
  onLineClick,
  onCheckAndApprove,
  suppressVerified,
  showUnclassified,
  onToggleUnclassified,
  boqReady = false,
}: {
  boq: Boq;
  lines: readonly BoqLine[];
  catalog: readonly CatalogType[];
  detections?: readonly EffectiveDetection[];
  sheets?: readonly SheetDto[];
  glyphByKey?: Record<string, string>;
  focusKey: string | null;
  onLineClick: (lineKey: string, detectionIds: string[]) => void;
  onCheckAndApprove?: (lineKey: string, detectionIds: string[]) => void;
  /** When worker warnings block verification, never show “verified” badges. */
  suppressVerified?: boolean;
  showUnclassified?: boolean;
  onToggleUnclassified?: () => void;
  boqReady?: boolean;
}) {
  const t = useTranslations('takeoff');
  const classifiedQty = boq.lines
    .filter((l) => !l.excluded && (l.typeKey != null || l.identitySource === 'legend' || l.identitySource === 'library' || l.identitySource === 'manual'))
    .reduce((s, l) => s + l.quantity, 0);
  const unclassifiedLabel = t('detection.unclassified');
  const displayLines = groupBoqLinesForDisplay(lines, catalog, unclassifiedLabel, Boolean(suppressVerified));
  const byId = new Map(detections.map((item) => [item.id, item]));

  const statusCopy = (line: BoqLine) => {
    const status = boqLineStatus(line, Boolean(suppressVerified));
    if (status === 'autoIdentified') return t('boq.statusAutoIdentified');
    if (status === 'needsCheck') return t('boq.statusNeedsCheck');
    if (status === 'partiallyApproved') {
      const counts = boqLineApprovalCounts(line);
      return t('boq.statusPartiallyApproved', counts);
    }
    if (status === 'manuallyApproved') return t('boq.statusManuallyApproved');
    return t('boq.statusUnclassified');
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
      {boqReady ? (
        <p className="border-b border-[var(--pf-border-default)] px-2 py-1 text-xs text-[var(--pf-status-success-fg)]" data-testid="takeoff-boq-ready">
          {t('workspace.boqReady')}
        </p>
      ) : null}
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
              <th scope="col" className="w-[8.5rem] px-2 py-2 text-start font-medium">
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
                const tone = boqLineStatus(line, Boolean(suppressVerified));
                const approvalCounts = boqLineApprovalCounts(line);
                const toneClass =
                  tone === 'manuallyApproved' || tone === 'autoIdentified'
                    ? 'bg-[var(--pf-status-success-bg)] text-[var(--pf-status-success-fg)]'
                    : tone === 'needsCheck' || tone === 'partiallyApproved'
                      ? 'bg-[var(--pf-status-warning-bg)] text-[var(--pf-status-warning-fg)]'
                      : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]';
                const sample = line.detectionIds.map((id) => byId.get(id)).find((item): item is EffectiveDetection => Boolean(item));
                const sheet = sample ? sheets.find((item) => item.sheetKey === sample.sheetKey) : undefined;
                const identity = identityCopyKey(line.identitySource);
                const holdKind = line.originalLabel ? classifyLegendText(line.originalLabel) : 'device';
                const holdLine = isUndeterminedQuantityLine(line);
                const diagnosticCount = line.symbolCount ?? line.detectionIds.length;
                const needsAction =
                  tone === 'needsCheck' || tone === 'unclassified' || tone === 'partiallyApproved' || holdLine;
                const sampleStatus = sample ? detectionIdentityStatus(sample) : tone;
                return (
                  <tr key={line.key} data-identity-status={sampleStatus}>
                    <td className="p-0">
                      <button
                        type="button"
                        data-testid={line.typeKey == null && line.identitySource !== 'legend' ? 'takeoff-boq-line-unclassified' : 'takeoff-boq-line'}
                        className={`flex min-h-11 w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-start hover:bg-[var(--pf-action-subtle-hover)] ${
                          focusKey === line.key ? 'bg-[var(--pf-action-subtle-active)]' : ''
                        }`}
                        onClick={() => onLineClick(line.key, line.detectionIds)}
                      >
                        {sample ? (
                          <TakeoffSymbolGlyph
                            detection={sample}
                            sheet={sheet}
                            svgMarkup={glyphByKey[glyphKey(sample)] ?? glyphByKey[sample.id]}
                            mode="thumb"
                            highlight={false}
                            className="size-12 shrink-0"
                            testId="takeoff-boq-glyph"
                          />
                        ) : (
                          <TakeoffSymbolGlyph
                            detection={{ id: line.key, maskB64: undefined, colorHex: undefined }}
                            className="size-12 shrink-0"
                            testId="takeoff-boq-glyph"
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block break-words font-medium text-[var(--pf-text-primary)]">{displayName}</span>
                          {line.originalLabel && cadHtmlTextLine(line.originalLabel) !== displayName ? (
                            <span className="mt-0.5 block break-words text-[11px] text-[var(--pf-text-secondary)]">
                              {t('boq.originalLegend')}: {cadHtmlTextLine(line.originalLabel)}
                            </span>
                          ) : null}
                          {identity ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--pf-text-muted)]">{t(`boq.${identity}`)}</span>
                          ) : null}
                          {holdKind === 'linear' ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--pf-status-warning-fg)]">
                              {t('boq.cableNoLength', { count: diagnosticCount })}
                            </span>
                          ) : null}
                          {holdKind === 'note' ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--pf-status-warning-fg)]">{t('boq.noteNotQuantity')}</span>
                          ) : null}
                          {holdKind === 'site_work' ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--pf-status-warning-fg)]">
                              {t('boq.siteWorkNeedsConfirm', { count: diagnosticCount })}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-end align-middle font-semibold tabular-nums text-[var(--pf-text-brand)]">
                      {holdLine ? (
                        <span>
                          {t('boq.quantityUndetermined')}
                          <span className="sr-only"> {boqQuantityDisplay(line)}</span>
                        </span>
                      ) : (
                        line.quantity
                      )}
                      {!holdLine && line.symbolCount != null && line.symbolCount !== line.quantity ? (
                        <span className="block text-xs font-normal text-[var(--pf-text-secondary)]">
                          {t('boq.symbolCount', { count: line.symbolCount })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 align-middle text-xs">
                      {tone === 'partiallyApproved' ? (
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 ${toneClass}`}
                            data-testid="takeoff-boq-partial-status"
                          >
                            {t('boq.statusPartiallyApproved', approvalCounts)}
                          </span>
                          {onCheckAndApprove ? (
                            <button
                              type="button"
                              data-testid="takeoff-boq-check-approve"
                              className={`inline-flex min-h-11 items-center rounded px-2 py-1 font-medium ${toneClass}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                const pendingIds = line.detectionIds.filter((id) => byId.get(id)?.status !== 'confirmed');
                                onCheckAndApprove(line.key, pendingIds.length > 0 ? pendingIds : line.detectionIds);
                              }}
                            >
                              {t('boq.checkAndApprove')}
                            </button>
                          ) : null}
                        </div>
                      ) : needsAction && onCheckAndApprove ? (
                        <button
                          type="button"
                          data-testid="takeoff-boq-check-approve"
                          className={`inline-flex min-h-11 items-center rounded px-2 py-1 font-medium ${toneClass}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onCheckAndApprove(line.key, line.detectionIds);
                          }}
                        >
                          {t('boq.checkAndApprove')}
                        </button>
                      ) : (
                        <span className={`inline-flex rounded px-1.5 py-0.5 ${toneClass}`}>{statusCopy(line)}</span>
                      )}
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
