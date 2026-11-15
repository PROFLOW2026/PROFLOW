'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  MousePointer2,
  Pencil,
  PlusCircle,
  RotateCcw,
} from 'lucide-react';
import type { TakeoffEdit, TakeoffReviewReason } from '../domain/contracts';
import { useTakeoffApi } from './api-provider';
import { PlanViewer } from './viewer/plan-viewer';
import { formatTakeoffDisplayName } from '../domain/format-display-name';
import { detectionDisplayLabel } from './boq-display';
import { devicesFromNote } from '../domain/quantity-notes';
import { isRevisionConflictError, takeoffErrorCode } from './takeoff-errors';
import { TakeoffConflictBanner, TakeoffLibraryDialog, TakeoffRuleSetDialog } from './takeoff-workspace-panels';
import { initialWorkspaceState, type TypeFilterState } from './workspace/takeoff-workspace-state';
import { TakeoffTypeFilterChips } from './takeoff-type-filter-chips';
import { TakeoffBoqPanel } from './takeoff-boq-panel';
import { TakeoffDetectionSheet } from './takeoff-detection-sheet';
import { TakeoffLimitationsBanner } from './takeoff-limitations-banner';
import { TakeoffSheetControls } from './takeoff-sheet-controls';
import { TakeoffSheetsPanel } from './takeoff-sheets-panel';
import { waitForExportReady } from './takeoff-export';
import { buildGroupReclassifyEdits, buildLegendLibraryEdit, hasBlockingWorkerWarnings } from './takeoff-analysis-view';
import { detectionsForSheet, parseSheetRefId, sheetRefId } from './sheet-ref';
import { sameSymbolDetections, undecodedLegendExemplars } from './symbol-group';

export function TakeoffWorkspace({
  analysisId,
  projectId,
  listPath = '/',
}: {
  analysisId: string;
  projectId: string;
  listPath?: string;
}) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const router = useRouter();
  const [state, setState] = useState(initialWorkspaceState);
  const [areaDraft, setAreaDraft] = useState<[number, number][]>([]);
  const pendingRef = useRef<TakeoffEdit[]>([]);
  const flushRef = useRef<(edits: TakeoffEdit[]) => Promise<void>>(async () => {});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState('');
  const [bulkSaveLibrary, setBulkSaveLibrary] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportLinks, setExportLinks] = useState<Partial<Record<'xlsx' | 'boq-pdf' | 'annotated-pdf', { url: string; fileName: string }>>>({});
  const [showUnclassifiedBoq, setShowUnclassifiedBoq] = useState(true);
  const [legendLibraryType, setLegendLibraryType] = useState('');
  const sheetsPanelRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const view = await api.getAnalysisView(analysisId);
      const defaultSheet =
        view.sheets.find((sh) => sh.previewUrl) ??
        view.sheets.find((sh) => sh.kind === 'pdf_page') ??
        view.sheets[0] ??
        null;
      setState((s) => ({
        ...s,
        view,
        loading: false,
        activeSheetKey: defaultSheet ? sheetRefId(defaultSheet) : null,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false, error: t('errors.loadFailed') }));
    }
  }, [analysisId, api, t]);

  useEffect(() => {
    const run = () => void load();
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [load]);

  const sheets = state.view?.sheets;
  const sheet = useMemo(() => {
    if (!sheets?.length) return null;
    if (!state.activeSheetKey) return sheets[0] ?? null;
    const ref = parseSheetRefId(state.activeSheetKey);
    return sheets.find((s) => s.fileId === ref.fileId && s.sheetKey === ref.sheetKey) ?? sheets[0] ?? null;
  }, [state.activeSheetKey, sheets]);

  const sheetDetections = useMemo(
    () => (sheet && state.view ? detectionsForSheet(state.view.detections, sheet) : []),
    [sheet, state.view],
  );

  const reviewQueue = useMemo(
    () => state.view?.detections.filter((d) => d.needsReview || !d.typeKey) ?? [],
    [state.view?.detections],
  );

  const focusReview = (index: number) => {
    const next = Math.max(0, Math.min(reviewQueue.length - 1, index));
    const detection = reviewQueue[next];
    setState((current) => {
      const host = current.view?.sheets.find((item) =>
        detectionsForSheet(current.view?.detections ?? [], item).some((mark) => mark.id === detection?.id),
      );
      return {
        ...current,
        reviewIndex: next,
        selectedDetectionId: detection?.id ?? null,
        activeSheetKey: host ? sheetRefId(host) : current.activeSheetKey,
        mobilePanel: 'plan',
      };
    });
  };

  const boqDisplayLines = useMemo(() => {
    const lines = state.view?.boq.lines ?? [];
    if (showUnclassifiedBoq) return lines;
    return lines.filter((l) => l.typeKey != null);
  }, [showUnclassifiedBoq, state.view?.boq.lines]);

  const flushEdits = useCallback(
    async (edits: TakeoffEdit[]) => {
      if (!state.view || !edits.length) return;
      try {
        const next = await api.applyEdits(analysisId, edits, state.view.summary.revision);
        setState((s) => ({ ...s, view: next, saveNotice: t('workspace.saved') }));
      } catch (err) {
        if (isRevisionConflictError(err)) {
          setConflictBanner(t('workspace.revisionConflict'));
          setState((s) => ({ ...s, saveNotice: null }));
          await load();
        }
      }
    },
    [analysisId, api, load, state.view, t],
  );
  useEffect(() => {
    flushRef.current = flushEdits;
  }, [flushEdits]);

  const queueEdits = useCallback((edits: TakeoffEdit[]) => {
    if (!edits.length) return;
    pendingRef.current = [...pendingRef.current, ...edits];
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const batch = pendingRef.current;
      pendingRef.current = [];
      void flushRef.current(batch);
    }, 0);
  }, []);

  const queueEdit = useCallback((edit: TakeoffEdit) => queueEdits([edit]), [queueEdits]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const batch = pendingRef.current;
      pendingRef.current = [];
      if (batch.length > 0) void flushRef.current(batch);
    };
  }, []);

  const selected = state.view?.detections.find((d) => d.id === state.selectedDetectionId) ?? null;
  const selectedSymbolGroup = useMemo(() => {
    if (!selected || !state.view) return [];
    return sameSymbolDetections(selected, state.view.detections);
  }, [selected, state.view]);
  const legendExemplars = useMemo(
    () => (state.view ? undecodedLegendExemplars(state.view.detections) : []),
    [state.view],
  );

  const setFilter = (updater: (f: TypeFilterState) => TypeFilterState) => {
    setState((s) => ({ ...s, typeFilter: updater(s.typeFilter) }));
  };

  const focusBoqLine = (lineKey: string, detectionIds: string[]) => {
    setState((s) => ({
      ...s,
      focusBoqLineKey: lineKey,
      highlightedDetectionIds: new Set(detectionIds),
    }));
  };

  const reasonLabel = (r: TakeoffReviewReason | string) => {
    const extra = r === 'pdf_only' || r === 'dwg_only';
    if (extra) return t(`reviewReason.${r}` as 'reviewReason.pdf_only');
    return t(`reviewReason.${r as TakeoffReviewReason}`);
  };

  if (state.loading) {
    return (
      <p className="p-4 text-sm text-[var(--pf-text-muted)]" role="status">
        {t('common.loading')}
      </p>
    );
  }
  if (state.error || !state.view || !sheet) {
    return (
      <p className="p-4 text-sm text-[var(--pf-status-danger-fg)]" role="alert">
        {state.error ?? t('errors.loadFailed')}
      </p>
    );
  }

  const view = state.view;
  const reviewDetection = reviewQueue[state.reviewIndex] ?? null;
  const reviewSymbolGroup = reviewDetection ? sameSymbolDetections(reviewDetection, view.detections) : [];
  const readOnly = !view.permissions.canEdit || view.summary.status === 'approved';
  const dimOthers = state.highlightedDetectionIds.size > 0;
  const approvalBlockedByReview = view.boq.unclassifiedCount > 0 || view.boq.needsReviewCount > 0;
  const approvalBlockedByPlan = view.planReviewConfirmed !== true;
  const canClickApprove = view.permissions.canApprove && !approvalBlockedByReview && !approvalBlockedByPlan;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <TakeoffLimitationsBanner
        view={state.view}
        onFocusSheet={(sheetKey) => {
          const target =
            state.view?.sheets.find((sh) => sh.sheetKey === sheetKey) ??
            state.view?.sheets[0];
          if (!target) return;
          setState((s) => ({ ...s, activeSheetKey: sheetRefId(target), mobilePanel: 'plan' }));
        }}
        onOpenSheetsPanel={() => {
          sheetsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setState((s) => ({ ...s, mobilePanel: 'boq' }));
        }}
        onOpenPairing={() => {
          sheetsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setState((s) => ({ ...s, mobilePanel: 'boq' }));
        }}
      />
      {conflictBanner ? <TakeoffConflictBanner message={conflictBanner} onDismiss={() => setConflictBanner(null)} /> : null}
      {state.saveNotice ? (
        <p className="border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-1 text-xs text-[var(--pf-text-secondary)]" role="status">
          {state.saveNotice}
        </p>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:max-w-[58%]">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {state.view.sheets.map((s) => {
              const id = sheetRefId(s);
              return (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={id === state.activeSheetKey ? 'primary' : 'secondary'}
                  className="min-h-11 max-w-full truncate"
                  onClick={() => setState((st) => ({ ...st, activeSheetKey: id }))}
                >
                  {formatTakeoffDisplayName(s.name)}
                  {!s.scale.verified || hasBlockingWorkerWarnings(view) ? (
                    <span className="ms-1 rounded bg-[var(--pf-status-warning-bg)] px-1 text-[10px]">{t('scale.unverified')}</span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          <TakeoffSheetControls
            key={`${sheet.sheetKey}-${sheet.floorLabel ?? ''}-${sheet.scale.ratio ?? ''}-${sheet.scale.verified}`}
            sheet={sheet}
            readOnly={readOnly}
            onApply={(edit) => queueEdit(edit)}
          />

          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setRulesOpen(true)}>
              {t('rules.open')}
            </Button>
            {state.view.permissions.canManageLibrary ? (
              <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setLibraryOpen(true)}>
                {t('library.open')}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1 border-b border-[var(--pf-border-default)] pb-2">
            <Button
              type="button"
              size="sm"
              variant={state.viewerTool === 'navigate' ? 'primary' : 'ghost'}
              className="min-h-11"
              disabled={readOnly}
              onClick={() => setState((s) => ({ ...s, viewerTool: 'navigate' }))}
            >
              <MousePointer2 className="size-4" />
              {t('tools.navigate')}
            </Button>
            <Button
              type="button"
              data-testid="takeoff-add-detection"
              size="sm"
              variant={state.viewerTool === 'add' ? 'primary' : 'ghost'}
              className="min-h-11"
              disabled={readOnly}
              onClick={() => setState((s) => ({ ...s, viewerTool: 'add' }))}
            >
              <PlusCircle className="size-4" />
              {t('tools.add')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={state.viewerTool === 'area' ? 'primary' : 'ghost'}
              className="min-h-11"
              disabled={readOnly}
              onClick={() => setState((s) => ({ ...s, viewerTool: 'area' }))}
            >
              <Pencil className="size-4" />
              {t('tools.area')}
            </Button>
          </div>

          <TakeoffTypeFilterChips catalog={state.view.catalog} filter={state.typeFilter} onChange={setFilter} />

          {legendExemplars.length > 0 ? (
            <section
              aria-label={t('detection.undecodedLegendTitle')}
              data-testid="takeoff-undecoded-legend"
              className="min-w-0 overflow-x-hidden rounded-lg border border-[var(--pf-border-default)] p-2"
            >
              <p className="text-xs font-medium text-[var(--pf-text-primary)]">{t('detection.undecodedLegendTitle')}</p>
              <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('detection.undecodedLegendHint')}</p>
              <label className="mb-1 flex min-w-0 flex-col gap-1 text-xs text-[var(--pf-text-secondary)]">
                <span>{t('detection.pickType')}</span>
                <select
                  data-testid="takeoff-legend-library-type"
                  className="min-h-11 w-full max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-2 text-sm"
                  value={legendLibraryType}
                  disabled={readOnly}
                  onChange={(event) => setLegendLibraryType(event.target.value)}
                >
                  <option value="">{t('detection.unclassified')}</option>
                  {view.catalog.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.nameHe}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                {legendExemplars.map((row) => (
                  <div key={row.legendKey} className="flex max-w-full flex-wrap items-center gap-1">
                    <button
                      type="button"
                      data-testid="takeoff-legend-exemplar"
                      data-legend-key={row.legendKey}
                      data-exemplar-id={row.exemplarId ?? ''}
                      data-count={row.count}
                      className="min-h-11 max-w-full truncate rounded-md border border-[var(--pf-border-default)] px-2 text-start text-xs hover:bg-[var(--pf-action-subtle-hover)]"
                      onClick={() => {
                        if (!row.exemplarId) return;
                        const host = view.sheets.find((item) =>
                          detectionsForSheet(view.detections, item).some((mark) => mark.id === row.exemplarId),
                        );
                        setState((current) => ({
                          ...current,
                          selectedDetectionId: row.exemplarId,
                          activeSheetKey: host ? sheetRefId(host) : current.activeSheetKey,
                          mobilePanel: 'plan',
                        }));
                      }}
                    >
                      {t('detection.undecodedLegendRow', { key: row.legendKey, count: row.count })}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11 max-w-full"
                      data-testid="takeoff-legend-save-library"
                      data-legend-key={row.legendKey}
                      data-count={row.count}
                      disabled={readOnly || !legendLibraryType}
                      onClick={() => {
                        const edit = buildLegendLibraryEdit(row.legendKey, legendLibraryType);
                        if (edit) queueEdit(edit);
                      }}
                    >
                      {t('detection.saveToLibrary')}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <PlanViewer
            sheet={sheet}
            detections={sheetDetections}
            catalog={state.view.catalog}
            filter={state.typeFilter}
            highlightedIds={state.highlightedDetectionIds}
            selectedId={state.selectedDetectionId}
            dimOthers={dimOthers}
            addMode={state.viewerTool === 'add'}
            areas={state.view.areas}
            onSelectDetection={(id) => setState((s) => ({ ...s, selectedDetectionId: id }))}
            onPlanClick={(x, y) => {
              if (readOnly) return;
              const tempId = `user-${Date.now()}`;
              queueEdit({
                op: 'add',
                tempId,
                sheetKey: sheet.sheetKey,
                x,
                y,
                typeKey: null,
              });
              setState((s) => ({ ...s, selectedDetectionId: tempId }));
            }}
            onAreaPoint={
              state.viewerTool === 'area'
                ? (x, y) => setAreaDraft((pts) => [...pts, [x, y]])
                : undefined
            }
          />

          {state.viewerTool === 'area' && areaDraft.length >= 3 ? (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                const area = {
                  id: `area-${Date.now()}`,
                  sheetKey: sheet.sheetKey,
                  name: t('area.defaultName'),
                  polygon: areaDraft,
                };
                queueEdit({ op: 'upsert_area', area });
                setAreaDraft([]);
              }}
            >
              {t('area.save')}
            </Button>
          ) : null}
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:min-w-[18rem]">
          <div className="flex gap-1 lg:hidden">
            <Button
              type="button"
              size="sm"
              variant={state.mobilePanel === 'plan' ? 'primary' : 'ghost'}
              className="min-h-11 flex-1"
              onClick={() => setState((s) => ({ ...s, mobilePanel: 'plan' }))}
            >
              {t('mobile.plan')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={state.mobilePanel === 'boq' ? 'primary' : 'ghost'}
              className="min-h-11 flex-1"
              onClick={() => setState((s) => ({ ...s, mobilePanel: 'boq' }))}
            >
              {t('mobile.boq')}
            </Button>
          </div>

          <div className={`min-h-0 flex-1 flex-col gap-2 ${state.mobilePanel === 'boq' ? 'flex' : 'hidden lg:flex'}`}>
            <section ref={sheetsPanelRef} className="min-w-0 shrink-0">
              <TakeoffSheetsPanel
                view={view}
                readOnly={readOnly}
                onQueueEdit={(edit) => queueEdit(edit)}
                onFocusSheet={(refId) =>
                  setState((s) => ({ ...s, activeSheetKey: refId, mobilePanel: 'plan' }))
                }
              />
            </section>
            <TakeoffBoqPanel
              boq={state.view.boq}
              lines={boqDisplayLines}
              catalog={state.view.catalog}
              focusKey={state.focusBoqLineKey}
              onLineClick={focusBoqLine}
              suppressVerified={hasBlockingWorkerWarnings(view)}
              showUnclassified={showUnclassifiedBoq}
              onToggleUnclassified={() => setShowUnclassifiedBoq((v) => !v)}
            />

            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--pf-border-default)] p-2">
              <p className="mb-1 text-xs font-medium text-[var(--pf-text-secondary)]">{t('detection.listTitle')}</p>
              <ul className="space-y-1">
                {sheetDetections.slice(0, 200).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      data-testid="takeoff-detection-row"
                      aria-label={t('detection.rowAria', {
                        id: d.id,
                        type: detectionDisplayLabel(d, view.catalog, t('detection.unclassified')),
                      })}
                      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 text-start text-xs hover:bg-[var(--pf-action-subtle-hover)]"
                      onClick={() => setState((s) => ({ ...s, selectedDetectionId: d.id }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setState((s) => ({ ...s, selectedDetectionId: d.id }));
                        }
                      }}
                    >
                      <span className="min-w-0 truncate font-medium text-[var(--pf-text-primary)]">
                        {detectionDisplayLabel(d, view.catalog, t('detection.unclassified'))}
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--pf-text-secondary)]" aria-hidden>
                        {devicesFromNote(d.tagText)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-[var(--pf-border-default)] p-3">
              <h3 className="mb-2 text-sm font-semibold">{t('review.title')}</h3>
              {reviewQueue.length === 0 ? (
                <p className="text-xs text-[var(--pf-text-muted)]">{t('review.empty')}</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-[var(--pf-text-secondary)]">
                    {t('review.position', { current: state.reviewIndex + 1, total: reviewQueue.length })}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11 min-w-11"
                      data-testid="takeoff-review-prev"
                      onClick={() => focusReview(state.reviewIndex - 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11 min-w-11"
                      data-testid="takeoff-review-next"
                      onClick={() => focusReview(state.reviewIndex + 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 flex-1"
                      disabled={readOnly}
                      onClick={() => {
                        const id = reviewQueue[state.reviewIndex]?.id;
                        if (!id) return;
                        queueEdit({ op: 'confirm', detectionIds: [id] });
                      }}
                    >
                      <Check className="size-4" />
                      {t('review.confirm')}
                    </Button>
                  </div>
                  <div className="mt-2 space-y-2 border-t border-[var(--pf-border-default)] pt-2">
                    <p className="text-xs font-medium">{t('review.bulkTitle')}</p>
                    <select
                      data-testid="takeoff-sidebar-edit-type"
                      className="min-h-11 min-w-0 max-w-full rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
                      value={bulkType}
                      onChange={(e) => setBulkType(e.target.value)}
                    >
                      <option value="">{t('detection.unclassified')}</option>
                      {state.view.catalog.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.nameHe}
                        </option>
                      ))}
                    </select>
                    {reviewSymbolGroup.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-h-11 w-full"
                        data-testid="takeoff-select-symbol-group"
                        disabled={readOnly}
                        onClick={() => setBulkIds(new Set(reviewSymbolGroup.map((detection) => detection.id)))}
                      >
                        {t('detection.selectSymbolGroup', { count: reviewSymbolGroup.length })}
                      </Button>
                    ) : null}
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid="takeoff-bulk-save-to-library"
                        checked={bulkSaveLibrary}
                        disabled={readOnly || !bulkType}
                        onChange={(e) => setBulkSaveLibrary(e.target.checked)}
                      />
                      {t('detection.saveToLibrary')}
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 w-full"
                      disabled={readOnly || !bulkType || bulkIds.size === 0}
                      onClick={() => {
                        queueEdits(
                          buildGroupReclassifyEdits([...bulkIds], view.detections, bulkType, bulkSaveLibrary),
                        );
                        setBulkIds(new Set());
                      }}
                    >
                      {t('review.bulkAssign', { count: bulkIds.size })}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11 w-full"
                      disabled={readOnly}
                      onClick={() => {
                        const id = reviewQueue[state.reviewIndex]?.id;
                        if (!id) return;
                        setBulkIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                    >
                      {t('review.toggleSelect')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {selected ? (
        <TakeoffDetectionSheet
          key={selected.id}
          detection={selected}
          catalog={state.view.catalog}
          readOnly={readOnly}
          groupSize={selectedSymbolGroup.length}
          defaultApplyToGroup={selectedSymbolGroup.length > 1}
          reasonLabel={reasonLabel}
          onClose={() => setState((s) => ({ ...s, selectedDetectionId: null }))}
          onReclassify={(typeKey, saveToLibrary, applyToGroup) => {
            const ids = applyToGroup ? selectedSymbolGroup.map((detection) => detection.id) : [selected.id];
            queueEdits(buildGroupReclassifyEdits(ids, view.detections, typeKey, saveToLibrary));
          }}
          onSetNote={(tagText) => queueEdit({ op: 'set_note', detectionId: selected.id, tagText })}
          onConfirm={() => queueEdit({ op: 'confirm', detectionIds: [selected.id] })}
          onDelete={() => queueEdit({ op: 'delete', detectionId: selected.id })}
          onRestore={() => queueEdit({ op: 'restore', detectionId: selected.id })}
        />
      ) : null}

      {view.summary.persistenceMode === 'ephemeral' ? (
        <div
          className="mx-2 mb-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-xs text-[var(--pf-text-secondary)]"
          data-testid="takeoff-ephemeral-banner"
        >
          {t('ephemeral.banner')}
        </div>
      ) : null}

      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2">
        {view.summary.status !== 'approved' ? (
          <label className="flex min-h-11 min-w-0 flex-1 items-start gap-2 text-xs text-[var(--pf-text-primary)]">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              data-testid="takeoff-plan-review"
              checked={view.planReviewConfirmed === true}
              disabled={readOnly}
              onChange={(e) => queueEdit({ op: 'confirm_plan_review', confirmed: e.target.checked })}
            />
            <span>
              <span className="font-medium">{t('approval.planReviewLabel')}</span>
              <span className="mt-0.5 block text-[var(--pf-text-secondary)]">{t('approval.planReviewHint')}</span>
            </span>
          </label>
        ) : null}
        {approvalBlockedByReview ? (
          <p className="flex min-w-0 basis-full items-center gap-1 text-xs text-[var(--pf-status-warning-fg)]">
            <AlertTriangle className="size-4 shrink-0" />
            {t('approval.blockedHint')}
          </p>
        ) : null}
        {!approvalBlockedByReview && approvalBlockedByPlan && view.summary.status !== 'approved' ? (
          <p className="flex min-w-0 basis-full items-center gap-1 text-xs text-[var(--pf-status-warning-fg)]">
            <AlertTriangle className="size-4 shrink-0" />
            {t('approval.blockedPlanHint')}
          </p>
        ) : null}
        {!approvalBlockedByReview && !approvalBlockedByPlan ? (
          <p className="min-w-0 basis-full text-xs text-[var(--pf-text-muted)]">{t('approval.readyHint')}</p>
        ) : null}
        {view.summary.status === 'approved' && view.permissions.canReopen ? (
          <Button
            type="button"
            data-testid="takeoff-reopen"
            variant="secondary"
            className="min-h-11"
            onClick={() =>
              void api.reopenAnalysis(analysisId, state.view!.summary.revision).then((v) =>
                setState((s) => ({ ...s, view: v })),
              )
            }
          >
            <RotateCcw className="size-4" />
            {t('approval.reopen')}
          </Button>
        ) : view.summary.status !== 'approved' ? (
          <Button
            type="button"
            data-testid="takeoff-approve"
            className="min-h-11"
            disabled={!canClickApprove}
            title={
              !canClickApprove && approvalBlockedByReview
                ? t('approval.blockedHint')
                : !canClickApprove && approvalBlockedByPlan
                  ? t('approval.blockedPlanHint')
                  : undefined
            }
            onClick={() =>
              void api
                .approveAnalysis(analysisId, state.view!.summary.revision)
                .then((v) => setState((s) => ({ ...s, view: v, saveNotice: null })))
                .catch((err) => {
                  const code = takeoffErrorCode(err);
                  const message =
                    code === 'approval_blocked_plan_review'
                      ? t('errors.approval_blocked_plan_review')
                      : code === 'approval_blocked_review'
                        ? t('errors.approval_blocked_review')
                        : t('approval.blocked');
                  setState((s) => ({ ...s, saveNotice: message }));
                })
            }
          >
            <Check className="size-4" />
            {t('approval.approve')}
          </Button>
        ) : null}
        {view.permissions.canPurgeEphemeral ? (
          <Button
            type="button"
            data-testid="takeoff-purge-ephemeral"
            variant="ghost"
            className="min-h-11"
            onClick={() =>
              void api.purgeEphemeralTakeoff(analysisId).then(() => {
                router.push(listPath);
              })
            }
          >
            <Eraser className="size-4" />
            {t('ephemeral.purge')}
          </Button>
        ) : null}
        {(['xlsx', 'boq-pdf', 'annotated-pdf'] as const).map((kind) => {
          const ready = exportLinks[kind];
          const testId =
            kind === 'xlsx'
              ? 'takeoff-export-xlsx'
              : kind === 'boq-pdf'
                ? 'takeoff-export-boq-pdf'
                : 'takeoff-export-annotated-pdf';
          return (
            <div key={kind} className="flex min-h-11 flex-col gap-0.5">
              <Button
                type="button"
                data-testid={testId}
                variant="secondary"
                className="min-h-11"
                disabled={view.summary.status !== 'approved' || exportBusy === kind}
                title={view.summary.status !== 'approved' ? t('export.disabledHint') : undefined}
                aria-busy={exportBusy === kind}
                onClick={() => {
                  setExportBusy(kind);
                  void api
                    .requestExport(analysisId, kind)
                    .then(async ({ url, fileName }) => {
                      setState((s) => ({ ...s, saveNotice: t('export.pending') }));
                      await waitForExportReady(url);
                      setExportLinks((prev) => ({ ...prev, [kind]: { url, fileName } }));
                      setState((s) => ({ ...s, saveNotice: t('export.ready', { name: fileName }) }));
                    })
                    .catch(() => setState((s) => ({ ...s, saveNotice: t('export.failed') })))
                    .finally(() => setExportBusy(null));
                }}
              >
                <Download className="size-4" />
                {exportBusy === kind
                  ? t('export.pending')
                  : t(`export.${kind === 'xlsx' ? 'excel' : kind === 'boq-pdf' ? 'boqPdf' : 'annotatedPdf'}`)}
              </Button>
              {ready ? (
                <a
                  href={ready.url}
                  download={ready.fileName}
                  className="text-center text-[10px] text-[var(--pf-text-brand)] underline"
                >
                  {t('export.open')}
                </a>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={readOnly}
          onClick={() => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            const batch = pendingRef.current;
            pendingRef.current = [];
            void flushEdits(batch);
          }}
        >
          {t('workspace.saveNow')}
        </Button>
        {selected && !readOnly ? (
          <Button type="button" variant="danger" className="min-h-11" onClick={() => queueEdit({ op: 'delete', detectionId: selected.id })}>
            <Eraser className="size-4" />
            {t('detection.delete')}
          </Button>
        ) : null}
      </footer>
      {state.view ? (
        <>
          <TakeoffRuleSetDialog
            key={state.view.ruleSet.id}
            projectId={projectId}
            open={rulesOpen}
            ruleSet={state.view.ruleSet}
            onClose={() => setRulesOpen(false)}
            onSaved={(rs) => {
              setRulesOpen(false);
              void api.setAnalysisRuleSet(analysisId, rs.id, state.view!.summary.revision).then((v) =>
                setState((s) => ({ ...s, view: v })),
              );
            }}
          />
          <TakeoffLibraryDialog
            plannerKey={state.view.summary.plannerKey}
            open={libraryOpen}
            onClose={() => setLibraryOpen(false)}
          />
        </>
      ) : null}
    </div>
  );
}