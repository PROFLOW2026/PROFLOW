'use client';

import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AnalysisView, WorkerWarning } from '../domain/contracts';
import { aiAssistState, workerWarningsForView } from './takeoff-analysis-view';

const KNOWN_WARNING_CODES = new Set([
  'sheet_partial',
  'xref_missing',
  'ai_unavailable',
  'ai_active',
  'legend_ai',
  'merge_failed',
  'classify_failed',
  'extract_time_budget',
  'pdf_dwg_unpaired',
]);

function warningMessage(
  t: ReturnType<typeof useTranslations<'takeoff'>>,
  w: WorkerWarning,
  sheetName: string | undefined,
): string {
  if (KNOWN_WARNING_CODES.has(w.code)) {
    return t(
      `limitations.workerWarning.${w.code}` as 'limitations.workerWarning.xref_missing',
      { sheet: sheetName ?? w.sheetKey ?? '', message: w.message },
    );
  }
  return t('limitations.workerWarning.default', { message: w.message });
}

export function TakeoffLimitationsBanner({
  view,
  onFocusSheet,
  onOpenSheetsPanel,
  onOpenPairing,
}: {
  view: AnalysisView;
  onFocusSheet?: (sheetKey: string) => void;
  onOpenSheetsPanel?: () => void;
  onOpenPairing?: () => void;
}) {
  const t = useTranslations('takeoff');
  // Compact by default: a one-line summary keeps the BoQ counting line above the fold.
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const workerWarnings = workerWarningsForView(view);
  const sheetName = (key: string | undefined) =>
    key ? (view.sheets.find((s) => s.sheetKey === key)?.name ?? key) : undefined;

  const items: {
    id: string;
    text: string;
    sheetKey?: string;
    severity: WorkerWarning['severity'];
    action?: 'pairing' | 'sheets';
  }[] = [];

  if (view.boq.counting) {
    const c = view.boq.counting;
    items.push({
      id: 'counting-composition',
      text: t('limitations.countingComposition', {
        counted: c.countedTotal,
        pdf: c.countedBySource.pdf,
        dwg: c.countedBySource.dwg,
        merged: c.countedBySource.merged,
        pdfOnly: c.excluded.pdfOnly,
        legend: c.excluded.legendZone,
        twins: c.twinsCollapsed ?? 0,
        sheetExcluded: c.excluded.sheetExcluded ?? 0,
      }),
      severity: 'info',
      action: 'sheets',
    });
  }

  for (const w of workerWarnings) {
    const action = w.code === 'pdf_dwg_unpaired' ? ('pairing' as const) : undefined;
    items.push({
      id: `w-${w.code}-${w.sheetKey ?? ''}-${w.fileId ?? ''}`,
      text: warningMessage(t, w, sheetName(w.sheetKey ?? undefined)),
      sheetKey: w.sheetKey ?? undefined,
      severity: w.severity,
      action,
    });
  }

  if (!workerWarnings.some((w) => w.code.startsWith('sheet_partial') || w.code === 'sheet_partial')) {
    for (const s of view.boq.completeness.partialSheets) {
      items.push({
        id: `partial-${s}`,
        text: t('limitations.partialSheet', { sheet: sheetName(s) ?? s }),
        sheetKey: s,
        severity: 'warning',
      });
    }
  }

  for (const s of view.boq.completeness.skippedSheets) {
    items.push({ id: `skip-${s}`, text: t('limitations.skippedSheet', { sheet: sheetName(s) ?? s }), sheetKey: s, severity: 'info' });
  }

  for (const x of view.boq.completeness.xrefsMissing) {
    items.push({ id: `xref-${x}`, text: t('limitations.xrefMissing', { name: x }), severity: 'warning' });
  }

  for (const s of view.boq.completeness.scaleUnverifiedSheets) {
    items.push({
      id: `scale-${s}`,
      text: t('limitations.scaleUnverified', { sheet: sheetName(s) ?? s }),
      sheetKey: s,
      severity: 'warning',
    });
  }

  for (const line of view.boq.warnings) {
    items.push({ id: `boq-${line}`, text: line, severity: 'info' });
  }

  if (view.boq.unclassifiedCount > 0) {
    items.push({
      id: 'unclassified',
      text: t('limitations.unclassified', { count: view.boq.unclassifiedCount }),
      severity: 'warning',
    });
  }

  const ai = aiAssistState(view);
  items.push({
    id: 'ai-state',
    text:
      ai === 'unavailable'
        ? t('limitations.aiUnavailable')
        : ai === 'on'
          ? t('limitations.aiOn')
          : t('limitations.aiOff'),
    severity: ai === 'unavailable' ? 'warning' : 'info',
  });

  if (!items.length) return null;

  const errorCount = items.filter((i) => i.severity === 'error').length;
  const attentionCount = items.filter((i) => i.severity === 'error' || i.severity === 'warning').length;

  return (
    <div
      className="min-w-0 border-b border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] text-xs text-[var(--pf-status-warning-fg)]"
      role="note"
      data-testid="takeoff-limitations-banner"
    >
      <button
        type="button"
        data-testid="takeoff-limitations-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-1 text-start hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        onClick={() => setExpanded((v) => !v)}
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium" data-testid="takeoff-limitations-summary">
            {items.length === 1 ? t('limitations.summaryOne') : t('limitations.summaryMany', { count: items.length })}
          </span>
          {errorCount > 0 ? (
            <span
              className="rounded bg-[var(--pf-status-danger-bg)] px-1 text-[10px] text-[var(--pf-status-danger-fg)]"
              data-testid="takeoff-limitations-attention"
            >
              {t('limitations.attentionError', { count: errorCount })}
            </span>
          ) : attentionCount > 0 ? (
            <span className="rounded bg-[var(--pf-bg-surface)] px-1 text-[10px]" data-testid="takeoff-limitations-attention">
              {t('limitations.attention', { count: attentionCount })}
            </span>
          ) : null}
        </span>
        <span className="sr-only">{expanded ? t('limitations.collapse') : t('limitations.expand')}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {expanded ? (
        <ul id={listId} data-testid="takeoff-limitations-list" className="min-w-0 space-y-1 px-3 pb-2 ps-3">
          {items.map((item, index) => (
            // sheet keys (e.g. `p1`) repeat across files, so the semantic id alone is not unique.
            <li key={`${item.id}#${index}`} className="flex min-w-0 items-start gap-2">
              {item.action === 'pairing' && onOpenPairing ? (
                <button
                  type="button"
                  data-testid="takeoff-open-pairing"
                  className="min-h-11 min-w-0 flex-1 text-start underline decoration-dotted underline-offset-2 hover:opacity-90"
                  onClick={onOpenPairing}
                >
                  {item.text}
                </button>
              ) : item.action === 'sheets' && onOpenSheetsPanel ? (
                <button
                  type="button"
                  data-testid="takeoff-open-sheets-panel"
                  className="min-h-11 min-w-0 flex-1 text-start underline decoration-dotted underline-offset-2 hover:opacity-90"
                  onClick={onOpenSheetsPanel}
                >
                  {item.text}
                </button>
              ) : item.sheetKey && onFocusSheet ? (
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 text-start underline decoration-dotted underline-offset-2 hover:opacity-90"
                  onClick={() => onFocusSheet(item.sheetKey!)}
                >
                  {item.text}
                </button>
              ) : (
                <span className="min-w-0 flex-1">{item.text}</span>
              )}
              {item.severity === 'error' ? (
                <span className="shrink-0 rounded bg-[var(--pf-status-danger-bg)] px-1 text-[10px]">{t('limitations.severityError')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}