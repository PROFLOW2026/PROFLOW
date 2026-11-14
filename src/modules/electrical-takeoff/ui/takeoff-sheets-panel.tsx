'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link2, Unlink } from 'lucide-react';
import type { AnalysisView, SheetDto, TakeoffEdit } from '../domain/contracts';
import {
  pairedDwgForPdf,
  pairedPdfForDwg,
  resolveSheetInclusion,
  resolveSheetPairings,
  sheetRefId,
  suggestDwgLayoutsForPdf,
} from '../domain/sheet-selection';
import { isDetectionCountable } from '../domain/counting-policy';
import { detectionsForSheet, sheetRefId as uiSheetRefId } from './sheet-ref';

export function TakeoffSheetsPanel({
  view,
  readOnly,
  onQueueEdit,
  onFocusSheet,
}: {
  view: AnalysisView;
  readOnly: boolean;
  onQueueEdit: (edit: TakeoffEdit) => void;
  onFocusSheet: (refId: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'included' | 'excluded' | 'pdf' | 'dwg' | 'unpaired'>('all');
  const [query, setQuery] = useState('');
  const edits = view.appliedEdits ?? [];
  return (
    <TakeoffSheetsPanelInner
      view={view}
      edits={edits}
      readOnly={readOnly}
      filter={filter}
      query={query}
      onFilter={setFilter}
      onQuery={setQuery}
      onQueueEdit={onQueueEdit}
      onFocusSheet={onFocusSheet}
    />
  );
}

function TakeoffSheetsPanelInner({
  view,
  edits = [],
  readOnly,
  filter,
  query,
  onFilter,
  onQuery,
  onQueueEdit,
  onFocusSheet,
}: {
  view: AnalysisView;
  edits?: readonly TakeoffEdit[];
  readOnly: boolean;
  filter: 'all' | 'included' | 'excluded' | 'pdf' | 'dwg' | 'unpaired';
  query: string;
  onFilter: (f: 'all' | 'included' | 'excluded' | 'pdf' | 'dwg' | 'unpaired') => void;
  onQuery: (q: string) => void;
  onQueueEdit: (edit: TakeoffEdit) => void;
  onFocusSheet: (refId: string) => void;
}) {
  const t = useTranslations('takeoff');
  const inclusion = useMemo(
    () => resolveSheetInclusion(view.sheets, view.files, edits),
    [view.sheets, view.files, edits],
  );
  const pairs = useMemo(() => resolveSheetPairings(edits), [edits]);

  const fileNameById = useMemo(() => new Map(view.files.map((f) => [f.id, f.name])), [view.files]);

  const dwgSheets = view.sheets.filter((s) => s.kind === 'dwg_layout' || s.kind === 'dwg_model');
  const pdfSheets = view.sheets.filter((s) => s.kind === 'pdf_page');

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; counted: number }>();
    for (const s of view.sheets) {
      const dets = detectionsForSheet(view.detections, s);
      m.set(sheetRefId(s.fileId, s.sheetKey), {
        total: dets.length,
        counted: dets.filter((d) => isDetectionCountable(d)).length,
      });
    }
    return m;
  }, [view.sheets, view.detections]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return view.sheets.filter((s) => {
      const ref = sheetRefId(s.fileId, s.sheetKey);
      const included = inclusion.get(ref) ?? true;
      if (filter === 'included' && !included) return false;
      if (filter === 'excluded' && included) return false;
      if (filter === 'pdf' && s.kind !== 'pdf_page') return false;
      if (filter === 'dwg' && s.kind === 'pdf_page') return false;
      if (filter === 'unpaired' && s.kind === 'pdf_page') {
        if (pairedDwgForPdf(pairs, s.fileId, s.sheetKey)) return false;
        return true;
      }
      if (filter === 'unpaired') return false;
      if (!q) return true;
      const blob = `${fileNameById.get(s.fileId) ?? s.fileId} ${s.name} ${s.sheetKey} ${s.floorHint ?? ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [view.sheets, inclusion, filter, query, pairs, fileNameById]);

  const setAll = (included: boolean) => {
    for (const s of view.sheets) {
      onQueueEdit({ op: 'set_sheet_included', fileId: s.fileId, sheetKey: s.sheetKey, included });
    }
  };

  return (
    <section
      className="flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-[var(--pf-border-default)]"
      data-testid="takeoff-sheets-panel"
    >
      <header className="space-y-2 border-b border-[var(--pf-border-default)] px-3 py-2">
        <h2 className="text-sm font-semibold">{t('sheets.title')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('sheets.hint')}</p>
        <input
          type="search"
          data-testid="takeoff-sheets-filter"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('sheets.search')}
          className="min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {(['all', 'included', 'excluded', 'pdf', 'dwg', 'unpaired'] as const).map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? 'primary' : 'ghost'}
              className="min-h-9"
              data-testid={`takeoff-sheets-filter-${f}`}
              onClick={() => onFilter(f)}
            >
              {t(`sheets.filter.${f}`)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="secondary" className="min-h-9" data-testid="takeoff-sheets-select-all" disabled={readOnly} onClick={() => setAll(true)}>
            {t('sheets.selectAll')}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="min-h-9" data-testid="takeoff-sheets-select-none" disabled={readOnly} onClick={() => setAll(false)}>
            {t('sheets.selectNone')}
          </Button>
        </div>
      </header>
      <ul className="min-h-0 max-h-56 flex-1 overflow-y-auto overflow-x-hidden p-1 lg:max-h-72">
        {rows.length === 0 ? (
          <li className="p-2 text-xs text-[var(--pf-text-muted)]">{t('sheets.empty')}</li>
        ) : (
          rows.map((s) => (
            <SheetRow
              key={sheetRefId(s.fileId, s.sheetKey)}
              sheet={s}
              fileLabel={fileNameById.get(s.fileId) ?? s.fileId}
              included={inclusion.get(sheetRefId(s.fileId, s.sheetKey)) ?? true}
              stats={stats.get(sheetRefId(s.fileId, s.sheetKey))}
              readOnly={readOnly}
              pairs={pairs}
              dwgSheets={dwgSheets}
              onQueueEdit={onQueueEdit}
              onFocus={() => onFocusSheet(uiSheetRefId(s))}
            />
          ))
        )}
      </ul>
      <p className="border-t border-[var(--pf-border-default)] px-3 py-2 text-[10px] text-[var(--pf-text-muted)]">{t('sheets.pairDefer')}</p>
    </section>
  );
}

function SheetRow({
  sheet,
  fileLabel,
  included,
  stats,
  readOnly,
  pairs,
  dwgSheets,
  onQueueEdit,
  onFocus,
}: {
  sheet: SheetDto;
  fileLabel: string;
  included: boolean;
  stats?: { total: number; counted: number };
  readOnly: boolean;
  pairs: ReturnType<typeof resolveSheetPairings>;
  dwgSheets: SheetDto[];
  onQueueEdit: (edit: TakeoffEdit) => void;
  onFocus: () => void;
}) {
  const t = useTranslations('takeoff');
  const ref = sheetRefId(sheet.fileId, sheet.sheetKey);
  const pair =
    sheet.kind === 'pdf_page'
      ? pairedDwgForPdf(pairs, sheet.fileId, sheet.sheetKey)
      : pairedPdfForDwg(pairs, sheet.fileId, sheet.sheetKey);

  const suggestions =
    sheet.kind === 'pdf_page'
      ? suggestDwgLayoutsForPdf(sheet, fileLabel, dwgSheets)
      : [];

  const kindLabel = t(`sheets.kind.${sheet.kind}` as 'sheets.kind.pdf_page');

  return (
    <li className="mb-1 rounded-md border border-[var(--pf-border-default)] p-2 text-xs">
      <div className="flex min-w-0 items-start gap-2">
        <label className="flex min-h-11 shrink-0 items-center gap-1">
          <input
            type="checkbox"
            checked={included}
            disabled={readOnly}
            data-testid={`takeoff-sheet-include-${ref.replace(/:/g, '-')}`}
            onChange={(e) =>
              onQueueEdit({
                op: 'set_sheet_included',
                fileId: sheet.fileId,
                sheetKey: sheet.sheetKey,
                included: e.target.checked,
              })
            }
          />
          <span className="sr-only">{t('sheets.includeToggle')}</span>
        </label>
        <div className="min-w-0 flex-1">
          <button type="button" className="min-w-0 text-start font-medium underline-offset-2 hover:underline" onClick={onFocus}>
            {sheet.name || sheet.sheetKey}
          </button>
          <p className="truncate text-[var(--pf-text-muted)]">
            {fileLabel} · {kindLabel}
            {sheet.floorHint ? ` · ${sheet.floorHint}` : ''}
          </p>
          <p className="text-[var(--pf-text-secondary)]">
            {t('sheets.stats', {
              detections: stats?.total ?? 0,
              counted: stats?.counted ?? 0,
              analyzed: t(`sheets.analyzed.${sheet.analyzed}` as 'sheets.analyzed.full'),
              scale: sheet.scale.verified ? t('sheets.scaleVerified') : t('sheets.scaleUnverified'),
            })}
          </p>
          {pair ? (
            <p className="mt-1 flex items-center gap-1 text-[var(--pf-text-brand)]">
              <Link2 className="size-3" />
              {sheet.kind === 'pdf_page'
                ? t('sheets.pairedTo', { target: pair.dwgSheetKey })
                : t('sheets.pairedFrom', { target: pair.pdfSheetKey })}
            </p>
          ) : sheet.kind === 'pdf_page' ? (
            <div className="mt-1 space-y-1">
              <p className="text-[var(--pf-status-warning-fg)]">{t('sheets.unpairedPdf')}</p>
              {!readOnly && suggestions.length ? (
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((dwg) => (
                    <Button
                      key={sheetRefId(dwg.fileId, dwg.sheetKey)}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-9"
                      data-testid="takeoff-sheet-pair-suggest"
                      onClick={() =>
                        onQueueEdit({
                          op: 'pair_sheets',
                          pdfFileId: sheet.fileId,
                          pdfSheetKey: sheet.sheetKey,
                          dwgFileId: dwg.fileId,
                          dwgSheetKey: dwg.sheetKey,
                        })
                      }
                    >
                      {t('sheets.pairSuggest', { name: dwg.name || dwg.sheetKey })}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {pair && !readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1 min-h-9"
              data-testid="takeoff-sheet-unpair"
              onClick={() =>
                onQueueEdit({
                  op: 'unpair_sheets',
                  pdfFileId: pair.pdfFileId,
                  pdfSheetKey: pair.pdfSheetKey,
                  dwgFileId: pair.dwgFileId,
                  dwgSheetKey: pair.dwgSheetKey,
                })
              }
            >
              <Unlink className="size-3" />
              {t('sheets.unpair')}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}