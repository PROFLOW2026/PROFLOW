'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useOptionalToast } from '@/components/ui/toast';
import {
  Check,
  Download,
  Eraser,
  Info,
  MousePointer2,
  Pencil,
  PlusCircle,
  RotateCcw,
} from 'lucide-react';
import type { AnalysisView, CatalogType, SymbolLibraryEntry, TakeoffEdit, TakeoffReviewReason } from '../domain/contracts';
import { TakeoffTypePicker, type TakeoffCatalogMutations } from './takeoff-type-picker';
import { useTakeoffApi } from './api-provider';
import { PlanViewer } from './viewer/plan-viewer';
import { TakeoffDwgPlan } from './viewer/takeoff-dwg-plan';
import { formatTakeoffDisplayName } from '../domain/format-display-name';
import { detectionCensus, detectionDisplayLabel } from './boq-display';
import { isRevisionConflictError, takeoffErrorCode } from './takeoff-errors';
import { TakeoffConflictBanner, TakeoffLibraryDialog, TakeoffRuleSetDialog } from './takeoff-workspace-panels';
import { colorForDetection, initialWorkspaceState, type TypeFilterState } from './workspace/takeoff-workspace-state';
import { TakeoffTypeFilterChips } from './takeoff-type-filter-chips';
import { TakeoffBoqPanel } from './takeoff-boq-panel';
import { TakeoffDetectionSheet } from './takeoff-detection-sheet';
import { TakeoffLimitationsBanner } from './takeoff-limitations-banner';
import { TakeoffSheetControls } from './takeoff-sheet-controls';
import { TakeoffSheetsPanel } from './takeoff-sheets-panel';
import { waitForExportReady } from './takeoff-export';
import {
  buildLegendLibraryEdit,
  buildSetLabelEdits,
  detectionsSharingBoqItem,
  hasBlockingWorkerWarnings,
  legendConflictOnDetection,
  legendDisplayText,
} from './takeoff-analysis-view';
import {
  buildExcludeFromBoqEdits,
  buildRestoreToBoqEdits,
  buildSaveReviewEdits,
  nextUnconfirmedId,
  resolveExcludeFromBoqIds,
  resolveSaveReviewPlan,
} from './save-review-action';
import { detectionsForSheet, parseSheetRefId, sheetRefId } from './sheet-ref';
import { sameSymbolDetections, undecodedLegendExemplars } from './symbol-group';
import { buildReviewGroups, nextReviewFocusAfterExclude, typeSuggestions } from './review-guide';
import { TakeoffReviewGuide } from './takeoff-review-guide';
import { TakeoffSymbolGlyph } from './takeoff-symbol-glyph';
import { reviewPlainKey } from '../domain/review-copy';
import { firstPlanOccurrenceId } from '../domain/legend-zone-policy';

export function TakeoffWorkspace({
  analysisId,
  projectId,
  listPath = '/',
  sourceApiBase,
}: {
  analysisId: string;
  projectId: string;
  listPath?: string;
  /** Permission-checked DWG bytes, for example `/api/takeoff/source`. */
  sourceApiBase?: string;
}) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const toast = useOptionalToast();
  const router = useRouter();
  const [state, setState] = useState(initialWorkspaceState);
  const [areaDraft, setAreaDraft] = useState<[number, number][]>([]);
  const pendingRef = useRef<TakeoffEdit[]>([]);
  const flushRef = useRef<(edits: TakeoffEdit[]) => Promise<AnalysisView | null>>(async () => null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [completedReviewKeys, setCompletedReviewKeys] = useState<string[]>([]);
  const [guideIndex, setGuideIndex] = useState(0);
  const [shownOccurrenceId, setShownOccurrenceId] = useState<string | null>(null);
  const [guideSaving, setGuideSaving] = useState(false);
  const actionSavingRef = useRef(false);
  const lastSaveRetryRef = useRef<null | (() => Promise<boolean>)>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    tone: 'success' | 'danger' | 'info' | 'warning';
    text: string;
  } | null>(null);
  const [libraryEntries, setLibraryEntries] = useState<SymbolLibraryEntry[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportLinks, setExportLinks] = useState<Partial<Record<'xlsx' | 'boq-pdf' | 'annotated-pdf', { url: string; fileName: string }>>>({});
  const [showUnclassifiedBoq, setShowUnclassifiedBoq] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [dwgDownKey, setDwgDownKey] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<'split' | 'plan' | 'table'>('split');
  const [sideTab, setSideTab] = useState<'boq' | 'review' | 'sheet'>('boq');
  const [legendLibraryType, setLegendLibraryType] = useState('');
  const [cadGlyphsBySheet, setCadGlyphsBySheet] = useState<Record<string, Record<string, string>>>({});
  const [planFocusNonce, setPlanFocusNonce] = useState(0);
  const sheetsPanelRef = useRef<HTMLElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setState((s) => ({ ...s, loading: true, error: null }));
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
        activeSheetKey: s.activeSheetKey ?? (defaultSheet ? sheetRefId(defaultSheet) : null),
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
  const dwgSamples = useMemo(
    () =>
      sheetDetections.flatMap((mark) =>
        mark.native ? [{ nativeX: mark.native.x, nativeY: mark.native.y, previewX: mark.x, previewY: mark.y }] : [],
      ),
    [sheetDetections],
  );
  const dwgMarks = useMemo(
    () =>
      sheetDetections.flatMap((mark) =>
        mark.native
          ? [
              {
                id: mark.id,
                nativeX: mark.native.x,
                nativeY: mark.native.y,
                signature: mark.signature,
                colorHex: state.view ? colorForDetection(mark, state.view.catalog) : undefined,
              },
            ]
          : [],
      ),
    [sheetDetections, state.view],
  );
  const sheetLiveKey = sheet ? `${sheet.fileId}:${sheet.sheetKey}` : '';
  const cadGlyphs = cadGlyphsBySheet[sheetLiveKey] ?? {};
  const mergeCadGlyphs = useCallback((glyphs: Record<string, string>) => {
    if (!sheetLiveKey) return;
    setCadGlyphsBySheet((current) => ({
      ...current,
      [sheetLiveKey]: { ...(current[sheetLiveKey] ?? {}), ...glyphs },
    }));
  }, [sheetLiveKey]);
  const showDwgPlan = Boolean(
    sourceApiBase &&
      sheet &&
      (sheet.kind === 'dwg_layout' || sheet.kind === 'dwg_model') &&
      dwgSamples.length >= 2 &&
      dwgDownKey !== sheetLiveKey,
  );

  const boqDisplayLines = useMemo(() => {
    const lines = state.view?.boq.lines ?? [];
    if (showUnclassifiedBoq) return lines;
    return lines.filter((l) => l.typeKey != null || l.identitySource === 'legend' || l.identitySource === 'library' || l.identitySource === 'manual');
  }, [showUnclassifiedBoq, state.view?.boq.lines]);

  const announce = useCallback(
    (tone: 'success' | 'danger' | 'info' | 'warning', text: string) => {
      setActionFeedback({ tone, text });
      setState((s) => ({ ...s, saveNotice: text }));
      toast?.push(text, tone === 'warning' ? 'info' : tone);
    },
    [toast],
  );

  const flushEdits = useCallback(
    async (edits: TakeoffEdit[]): Promise<AnalysisView | null> => {
      if (!state.view || !edits.length) return state.view;
      try {
        const next = await api.applyEdits(analysisId, edits, state.view.summary.revision);
        setState((s) => ({ ...s, view: next, saveNotice: t('workspace.saved') }));
        return next;
      } catch (err) {
        if (isRevisionConflictError(err)) {
          setConflictBanner(t('workspace.revisionConflict'));
          announce('warning', t('workspace.revisionConflict'));
          await load({ silent: true });
          return null;
        }
        const timedOut =
          err instanceof Error &&
          (err.message === 'timeout' || (err as { takeoffCode?: string }).takeoffCode === 'timeout');
        const message = timedOut ? t('workspace.saveTimeout') : t('workspace.saveFailed');
        announce('danger', message);
        return null;
      }
    },
    [analysisId, announce, api, load, state.view, t],
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

  const commitEdits = useCallback(async (edits: TakeoffEdit[]) => {
    if (actionSavingRef.current) return null;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const batch = [...pendingRef.current, ...edits];
    pendingRef.current = [];
    if (!batch.length) return state.view;
    actionSavingRef.current = true;
    setGuideSaving(true);
    try {
      return await flushRef.current(batch);
    } finally {
      actionSavingRef.current = false;
      setGuideSaving(false);
    }
  }, [state.view]);

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
  const reviewGroups = useMemo(
    () => (state.view ? buildReviewGroups(state.view.detections) : []),
    [state.view],
  );

  useEffect(() => {
    const plannerKey = state.view?.summary.plannerKey;
    if (!plannerKey) return;
    let cancelled = false;
    void api.listLibrary(plannerKey).then((entries) => {
      if (!cancelled) setLibraryEntries(entries);
    }).catch(() => {
      if (!cancelled) setLibraryEntries([]);
    });
    return () => {
      cancelled = true;
    };
  }, [api, state.view?.summary.plannerKey, state.view?.summary.revision]);

  const activeGuide = reviewGroups[Math.min(guideIndex, Math.max(reviewGroups.length - 1, 0))] ?? null;
  const guidedProgress = {
    checked: completedReviewKeys.length,
    total: completedReviewKeys.length + reviewGroups.filter((group) => !completedReviewKeys.includes(group.key)).length,
  };

  const focusOccurrence = (detectionId: string, lineKey?: string | null) => {
    setShownOccurrenceId(detectionId);
    setPlanFocusNonce((value) => value + 1);
    setState((current) => {
      const host = current.view?.sheets.find((item) =>
        detectionsForSheet(current.view?.detections ?? [], item).some((mark) => mark.id === detectionId),
      );
      return {
        ...current,
        selectedDetectionId: detectionId,
        highlightedDetectionIds: new Set([detectionId]),
        activeSheetKey: host ? sheetRefId(host) : current.activeSheetKey,
        ...(lineKey ? { focusBoqLineKey: lineKey } : {}),
      };
    });
  };

  const focusGuide = (group: (typeof reviewGroups)[number] | null) => {
    if (!group) return;
    focusOccurrence(group.focusId);
  };

  const advanceAfterExclude = (next: AnalysisView, excludedIds: readonly string[]) => {
    const result = nextReviewFocusAfterExclude({
      excludedIds,
      previousKey: activeGuide?.key ?? null,
      previousIndex: guideIndex,
      detections: next.detections,
    });
    if (result.completedKey) {
      setCompletedReviewKeys((prev) =>
        prev.includes(result.completedKey!) ? prev : [...prev, result.completedKey!],
      );
    }
    setGuideIndex(result.groupIndex);
    if (result.focusId) {
      focusOccurrence(result.focusId);
      return;
    }
    setShownOccurrenceId(null);
    setState((current) => ({ ...current, selectedDetectionId: null }));
  };

  const setFilter = (updater: (f: TypeFilterState) => TypeFilterState) => {
    setState((s) => ({ ...s, typeFilter: updater(s.typeFilter) }));
  };

  const focusBoqLine = (lineKey: string, detectionIds: string[]) => {
    const preferredSheet = sheet?.sheetKey;
    const detections = state.view?.detections ?? [];
    const onSheet = preferredSheet
      ? detectionIds.find((id) => detections.find((item) => item.id === id)?.sheetKey === preferredSheet)
      : undefined;
    const focusId = onSheet ?? detectionIds[0];
    if (!focusId) return;
    focusOccurrence(focusId, lineKey);
  };

  const openCheckAndApprove = (lineKey: string, detectionIds: string[]) => {
    const index = reviewGroups.findIndex((group) => group.detectionIds.some((id) => detectionIds.includes(id)));
    if (index >= 0) {
      setGuideIndex(index);
      setSideTab('review');
      const group = reviewGroups[index];
      const first = detectionIds.find((id) => group?.detectionIds.includes(id)) ?? group?.focusId;
      if (first) focusOccurrence(first, lineKey);
      return;
    }
    setSideTab('review');
    focusBoqLine(lineKey, detectionIds);
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
  const guideFocus = activeGuide ? view.detections.find((item) => item.id === activeGuide.focusId) ?? null : null;
  const readOnly = !view.permissions.canEdit || view.summary.status === 'approved';
  const catalogMutations: TakeoffCatalogMutations = {
    create: (input) => api.createCatalogType(input),
    update: (input) => api.updateCatalogType(input),
    archive: (input) => api.archiveCatalogType(input),
  };
  const onCatalogSaved = (type: CatalogType) => {
    setState((current) => {
      if (!current.view) return current;
      const map = new Map(current.view.catalog.map((row) => [row.key, row]));
      map.set(type.key, type);
      return { ...current, view: { ...current.view, catalog: [...map.values()] } };
    });
  };
  const dimOthers = state.highlightedDetectionIds.size > 0;
  const approvalBlockedByReview = view.boq.unclassifiedCount > 0 || view.boq.needsReviewCount > 0;
  const approvalBlockedByPlan = view.planReviewConfirmed !== true;
  const canClickApprove = view.permissions.canApprove && !approvalBlockedByReview && !approvalBlockedByPlan;
  const census = detectionCensus(view.detections);
  const pendingReview = census.untyped + census.typedNeedingCheck;
  const reviewBlockMessage =
    reviewGroups.length > 0
      ? t('workspace.groupsLeft', { count: reviewGroups.length })
      : t('workspace.approveNeedsReview');
  const actionHint =
    view.summary.status === 'approved'
      ? null
      : approvalBlockedByReview
        ? reviewBlockMessage
        : approvalBlockedByPlan
          ? t('workspace.approveNeedsPlan')
          : t('workspace.exportBlocked');
  const exportBlockReason = actionHint;
  const sideHiddenOnMobile = planExpanded;

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 shrink-0 flex-col overflow-x-hidden lg:h-[calc(100dvh-11rem)] lg:max-h-[calc(100dvh-11rem)] lg:flex-none lg:overflow-y-hidden">
      {infoOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal aria-label={t('workspace.info')}>
          <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t('workspace.info')}</h2>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setInfoOpen(false)}>
                {t('common.close')}
              </Button>
            </div>
            <p className="mb-2 text-xs text-[var(--pf-text-secondary)]">
              {t('boq.markCounts', { total: census.total, typed: census.typed, untyped: census.untyped })}
              {census.typedNeedingCheck > 0 ? ` · ${t('boq.typedNeedCheck', { count: census.typedNeedingCheck })}` : ''}
            </p>
            <p className="mb-2 text-xs text-[var(--pf-text-muted)]" data-testid="takeoff-job-meta">
              {t('workspace.jobFinished', {
                time: view.lastJob?.finishedAtIso
                  ? new Date(view.lastJob.finishedAtIso).toLocaleString('he-IL')
                  : t('workspace.unknown'),
              })}
              {' · '}
              {t('workspace.workerBuild', {
                build:
                  typeof view.workerStats.workerBuild === 'string'
                    ? view.workerStats.workerBuild
                    : t('workspace.unknown'),
              })}
            </p>
            <TakeoffLimitationsBanner
              view={state.view}
              onFocusSheet={(sheetKey) => {
                const target = state.view?.sheets.find((sh) => sh.sheetKey === sheetKey) ?? state.view?.sheets[0];
                if (!target) return;
                setInfoOpen(false);
                setSideTab('sheet');
                setState((s) => ({ ...s, activeSheetKey: sheetRefId(target), mobilePanel: 'plan' }));
              }}
              onOpenSheetsPanel={() => {
                setInfoOpen(false);
                setSideTab('sheet');
                setFocusMode('split');
                setState((s) => ({ ...s, mobilePanel: 'boq' }));
              }}
              onOpenPairing={() => {
                setInfoOpen(false);
                setSideTab('sheet');
                setFocusMode('split');
                setState((s) => ({ ...s, mobilePanel: 'boq' }));
              }}
            />
          </div>
        </div>
      ) : null}
      {conflictBanner ? <TakeoffConflictBanner message={conflictBanner} onDismiss={() => setConflictBanner(null)} /> : null}
      {state.saveNotice ? (
        <p className="border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-1 text-xs text-[var(--pf-text-secondary)]" role="status">
          {state.saveNotice}
        </p>
      ) : null}

      <div className="shrink-0 border-b border-[var(--pf-border-default)]" data-testid="takeoff-action-bar">
        <div className="flex min-w-0 flex-wrap items-center gap-2 px-2 py-2">
          <p className="w-full text-xs font-medium text-[var(--pf-text-primary)] lg:me-auto lg:w-auto">
            {t('workspace.statusLine', { total: census.total, pending: pendingReview })}
          </p>
          <Button
            type="button"
            size="sm"
            className="min-h-11 shrink-0"
            variant={sideTab === 'review' ? 'primary' : 'secondary'}
            onClick={() => {
              setSideTab('review');
              setFocusMode('split');
              setGuideIndex(0);
              setState((current) => ({ ...current, mobilePanel: 'boq' }));
              focusGuide(reviewGroups[0] ?? null);
            }}
          >
            {t('workspace.reviewNow')}
          </Button>
          {view.summary.status !== 'approved' ? (
            <label className="flex min-h-11 shrink-0 items-center gap-1 text-xs text-[var(--pf-text-primary)]">
              <input
                type="checkbox"
                className="size-4 shrink-0"
                data-testid="takeoff-plan-review"
                checked={view.planReviewConfirmed === true}
                disabled={readOnly}
                onChange={(e) => queueEdit({ op: 'confirm_plan_review', confirmed: e.target.checked })}
              />
              <span className="font-medium" title={t('approval.planReviewHint')}>{t('approval.planReviewLabel')}</span>
            </label>
          ) : null}
          {view.summary.status === 'approved' && view.permissions.canReopen ? (
            <Button
              type="button"
              data-testid="takeoff-reopen"
              variant="secondary"
              className="min-h-11 shrink-0"
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
              className="min-h-11 shrink-0"
              disabled={!canClickApprove || guideSaving}
              loading={guideSaving}
              title={
                !canClickApprove && approvalBlockedByReview
                  ? t('approval.blockedHint')
                  : !canClickApprove && approvalBlockedByPlan
                    ? t('approval.blockedPlanHint')
                    : t('approval.approve')
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
          {(['xlsx', 'boq-pdf', 'annotated-pdf'] as const).map((kind) => {
            const ready = exportLinks[kind];
            const testId =
              kind === 'xlsx' ? 'takeoff-export-xlsx' : kind === 'boq-pdf' ? 'takeoff-export-boq-pdf' : 'takeoff-export-annotated-pdf';
            const approved = view.summary.status === 'approved';
            const labelKey =
              kind === 'xlsx' && approved
                ? 'downloadExcel'
                : kind === 'xlsx'
                  ? 'excelShort'
                  : kind === 'boq-pdf'
                    ? 'boqPdfShort'
                    : 'annotatedPdfShort';
            const fullKey = kind === 'xlsx' ? 'excel' : kind === 'boq-pdf' ? 'boqPdf' : 'annotatedPdf';
            return (
              <div key={kind} className="flex min-h-11 shrink-0 flex-col justify-center">
                <Button
                  type="button"
                  data-testid={testId}
                  variant={kind === 'xlsx' && approved ? 'primary' : 'secondary'}
                  className="min-h-11 shrink-0"
                  disabled={!approved || exportBusy === kind}
                  title={!approved ? (exportBlockReason ?? t('workspace.exportBlocked')) : t(`export.${fullKey}`)}
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
                  {exportBusy === kind ? t('export.pending') : t(`export.${labelKey}`)}
                </Button>
                {ready ? (
                  <a href={ready.url} download={ready.fileName} className="text-center text-[10px] text-[var(--pf-text-brand)] underline">
                    {t('export.open')}
                  </a>
                ) : null}
              </div>
            );
          })}
          <ol className="flex w-full min-w-0 flex-wrap items-center gap-1 text-[11px] text-[var(--pf-text-secondary)] lg:w-auto">
            <li className={reviewGroups.length > 0 ? 'font-semibold text-[var(--pf-text-primary)]' : ''}>{t('workspace.stepReview')}</li>
            <li aria-hidden>←</li>
            <li className={reviewGroups.length === 0 && view.summary.status !== 'approved' ? 'font-semibold text-[var(--pf-text-primary)]' : ''}>{t('workspace.stepApprove')}</li>
            <li aria-hidden>←</li>
            <li className={view.summary.status === 'approved' ? 'font-semibold text-[var(--pf-text-primary)]' : ''}>{t('workspace.stepExcel')}</li>
          </ol>
          {actionHint ? <span className="text-xs text-[var(--pf-status-warning-fg)]" data-testid="takeoff-export-block-reason">{actionHint}</span> : null}
          <Button type="button" size="sm" variant="ghost" className="min-h-11 min-w-11 shrink-0" aria-label={t('workspace.info')} onClick={() => setInfoOpen(true)}>
            <Info className="size-4" />
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1 overflow-x-hidden px-2 lg:flex-nowrap lg:overflow-x-auto">
            {state.view.sheets.map((s) => {
              const id = sheetRefId(s);
              return (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={id === state.activeSheetKey ? 'primary' : 'secondary'}
                  className="min-h-9 max-w-full shrink-0 truncate"
                  onClick={() => setState((st) => ({ ...st, activeSheetKey: id }))}
                >
                  {formatTakeoffDisplayName(s.name)}
                  {!s.scale.verified ? (
                    <span className="ms-1 rounded bg-[var(--pf-status-warning-bg)] px-1 text-[10px]">{t('scale.unverified')}</span>
                  ) : null}
                </Button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-wrap gap-1 overflow-x-hidden px-2 py-1 lg:flex-nowrap lg:overflow-x-auto">
            <Button
              type="button"
              size="sm"
              variant={state.viewerTool === 'navigate' ? 'primary' : 'ghost'}
              className="min-h-11 shrink-0"
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
              className="min-h-11 shrink-0"
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
              className="min-h-11 shrink-0"
              disabled={readOnly}
              onClick={() => setState((s) => ({ ...s, viewerTool: 'area' }))}
            >
              <Pencil className="size-4" />
              {t('tools.area')}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-11 shrink-0" onClick={() => setRulesOpen(true)}>
              {t('rules.open')}
            </Button>
            {state.view.permissions.canManageLibrary ? (
              <Button type="button" size="sm" variant="ghost" className="min-h-11 shrink-0" onClick={() => setLibraryOpen(true)}>
                {t('library.open')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 shrink-0"
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
            {view.permissions.canPurgeEphemeral ? (
              <Button
                type="button"
                data-testid="takeoff-purge-ephemeral"
                variant="ghost"
                className="min-h-11 shrink-0"
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
            <div className="hidden gap-1 lg:flex">
              <Button type="button" size="sm" variant={focusMode === 'split' ? 'primary' : 'ghost'} className="min-h-11" onClick={() => setFocusMode('split')}>
                {t('workspace.focusSplit')}
              </Button>
              <Button type="button" size="sm" variant={focusMode === 'plan' ? 'primary' : 'ghost'} className="min-h-11" onClick={() => setFocusMode('plan')}>
                {t('workspace.focusPlan')}
              </Button>
              <Button type="button" size="sm" variant={focusMode === 'table' ? 'primary' : 'ghost'} className="min-h-11" onClick={() => setFocusMode('table')}>
                {t('workspace.focusTable')}
              </Button>
            </div>
          </div>
        </div>

      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 max-lg:flex-none lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-0 lg:overflow-hidden">
        <section className={`relative min-w-0 w-full min-h-0 flex-col overflow-hidden ${planExpanded ? 'fixed inset-2 z-50 flex rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2 shadow-lg' : 'flex max-lg:h-[min(70dvh,32rem)] max-lg:shrink-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:self-stretch'} ${focusMode === 'table' && !planExpanded ? 'lg:hidden' : ''}`}>
          {showDwgPlan && sourceApiBase && sheet && state.view ? (
            <TakeoffDwgPlan
              key={sheet.fileId}
              url={`${sourceApiBase}/${sheet.fileId}`}
              fileName={state.view.files.find((file) => file.id === sheet.fileId)?.name ?? 'drawing.dwg'}
              sheetKey={sheet.sheetKey}
              sheetName={sheet.name}
              kind={sheet.kind === 'dwg_model' ? 'dwg_model' : 'dwg_layout'}
              widthPx={sheet.widthPx}
              heightPx={sheet.heightPx}
              samples={dwgSamples}
              marks={dwgMarks}
              focusId={shownOccurrenceId ?? state.selectedDetectionId ?? activeGuide?.focusId ?? null}
              onSymbolGlyphs={mergeCadGlyphs}
              backgroundRefs={(sheet.xrefRefs?.length ? sheet.xrefRefs : sheet.xrefsMissing) ?? []}
              areas={state.view.areas.filter((area) => area.sheetKey === sheet.sheetKey)}
              onUnavailable={() => setDwgDownKey(sheetLiveKey)}
              onSelectMark={(id) => {
                if (sideTab === 'review') setShownOccurrenceId(id);
                else setState((current) => ({ ...current, selectedDetectionId: id }));
              }}
              onPlanClick={
                readOnly
                  ? undefined
                  : (x, y) => {
                      if (state.viewerTool === 'area') {
                        setAreaDraft((pts) => [...pts, [x, y]]);
                        return;
                      }
                      if (state.viewerTool !== 'add') return;
                      const tempId = `user-${Date.now()}`;
                      queueEdit({ op: 'add', tempId, sheetKey: sheet.sheetKey, x, y, typeKey: null });
                      setState((current) => ({ ...current, selectedDetectionId: tempId }));
                    }
              }
            />
          ) : (
          <PlanViewer
            sheet={sheet}
            detections={sheetDetections}
            catalog={state.view.catalog}
            filter={state.typeFilter}
            highlightedIds={state.highlightedDetectionIds}
            selectedId={shownOccurrenceId ?? state.selectedDetectionId ?? activeGuide?.focusId ?? null}
            focusNonce={planFocusNonce}
            dimOthers={dimOthers}
            addMode={state.viewerTool === 'add'}
            expanded={planExpanded}
            onToggleExpanded={() => setPlanExpanded((open) => !open)}
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
          )}

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

        <section className={`min-w-0 w-full flex-col border-[var(--pf-border-default)] lg:min-h-0 lg:w-[min(26rem,38vw)] lg:shrink-0 lg:overflow-hidden lg:border-s ${sideHiddenOnMobile ? 'hidden' : 'flex'} ${focusMode === 'plan' ? 'lg:hidden' : 'lg:flex'}`}>
          <div className="flex shrink-0 gap-1 border-b border-[var(--pf-border-default)] p-1">
            {(['boq', 'review', 'sheet'] as const).map((tab) => (
              <Button
                key={tab}
                type="button"
                size="sm"
                variant={sideTab === tab ? 'primary' : 'ghost'}
                className="min-h-11 flex-1"
                onClick={() => {
                  setSideTab(tab);
                  if (tab === 'review') focusGuide(activeGuide);
                }}
              >
                {t(tab === 'boq' ? 'workspace.sideBoq' : tab === 'review' ? 'workspace.sideReview' : 'workspace.sideSheet')}
              </Button>
            ))}
          </div>
          <div className={`flex-col gap-2 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${sideTab === 'boq' ? 'flex' : 'hidden'}`}>
            <TakeoffBoqPanel
              boq={state.view.boq}
              lines={boqDisplayLines}
              catalog={state.view.catalog}
              detections={view.detections}
              sheets={view.sheets}
              glyphByKey={cadGlyphs}
              focusKey={state.focusBoqLineKey}
              onLineClick={focusBoqLine}
              onCheckAndApprove={openCheckAndApprove}
              suppressVerified={hasBlockingWorkerWarnings(view)}
              showUnclassified={showUnclassifiedBoq}
              onToggleUnclassified={() => setShowUnclassifiedBoq((v) => !v)}
              boqReady={reviewGroups.length === 0}
            />
          </div>

          <div className={`flex-col gap-2 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${sideTab === 'review' ? 'flex' : 'hidden'}`}>
            {activeGuide && guideFocus ? (
              <TakeoffReviewGuide
                key={activeGuide.key}
                group={activeGuide}
                focus={guideFocus}
                occurrences={activeGuide.detectionIds.flatMap((id) => {
                  const mark = view.detections.find((item) => item.id === id);
                  return mark && !mark.reasons.includes('user_excluded') ? [mark] : [];
                })}
                sheet={
                  view.sheets.find((item) =>
                    detectionsForSheet(view.detections, item).some(
                      (mark) => mark.id === (shownOccurrenceId ?? guideFocus.id),
                    ),
                  ) ?? sheet
                }
                planSvgMarkup={(() => {
                  const shown = view.detections.find((item) => item.id === (shownOccurrenceId ?? guideFocus.id));
                  if (!shown) return null;
                  return cadGlyphs[shown.signature ? `sig:${shown.signature}` : shown.id] ?? cadGlyphs[shown.id] ?? null;
                })()}
                catalog={view.catalog}
                suggestions={typeSuggestions(
                  guideFocus,
                  view.detections,
                  libraryEntries,
                  new Set(view.catalog.map((type) => type.key)),
                )}
                separateOccurrences={Math.max(
                  0,
                  sameSymbolDetections(guideFocus, view.detections).filter(
                    (item) =>
                      item.status !== 'confirmed' &&
                      !item.reasons.includes('drawing_noise') &&
                      !item.reasons.includes('legend_zone'),
                  ).length - activeGuide.detectionIds.length,
                )}
                readOnly={readOnly}
                canManageLibrary={view.permissions.canManageLibrary}
                canManageCatalog={view.permissions.canManageLibrary}
                catalogMutations={catalogMutations}
                onCatalogSaved={onCatalogSaved}
                legendRows={view.legend ?? []}
                saving={guideSaving}
                progress={guidedProgress}
                shownId={shownOccurrenceId ?? guideFocus.id}
                feedback={actionFeedback}
                onRetry={() => {
                  void lastSaveRetryRef.current?.();
                }}
                onShowOccurrence={(detectionId) => {
                  focusOccurrence(detectionId);
                }}
                onExcludeFromBoq={(choice) => {
                  const current = view.detections.find((item) => item.id === choice.detectionIds[0]) ?? guideFocus;
                  const ids = resolveExcludeFromBoqIds({
                    selected: current,
                    detections: view.detections,
                    applyToGroup: choice.detectionIds.length > 1,
                    candidateIds: choice.detectionIds,
                    explicitGroupConfirm: choice.explicitGroupConfirm,
                  });
                  const edits = buildExcludeFromBoqEdits(ids);
                  if (edits.length === 0) return;
                  void commitEdits(edits).then((next) => {
                    if (!next) return;
                    announce(
                      'success',
                      ids.length === 1 ? t('detection.excludedFromBoqOne') : t('detection.excludedFromBoq', { count: ids.length }),
                    );
                    advanceAfterExclude(next, ids);
                  });
                }}
                onRestoreToBoq={(choice) => {
                  const edits = buildRestoreToBoqEdits(choice.detectionIds);
                  if (edits.length === 0) return;
                  void commitEdits(edits).then((next) => {
                    if (!next) return;
                    announce('success', t('detection.restoredToReview'));
                  });
                }}
                onConfirm={async (choice) => {
                  const run = async () => {
                    const current = view.detections.find((item) => item.id === choice.detectionIds[0]) ?? guideFocus;
                    const plan = resolveSaveReviewPlan({
                      selected: current,
                      detections: view.detections,
                      applyToGroup: choice.detectionIds.length > 1,
                      candidateIds: choice.detectionIds,
                      typeKey: choice.typeKey,
                      confirm: choice.confirm,
                      saveToLibrary: choice.saveToLibrary,
                      explicitGroupConfirm: choice.explicitGroupConfirm,
                    });
                    const ids = plan.ids;
                    const edits: TakeoffEdit[] = [];
                    if (choice.label) {
                      for (const id of ids) {
                        edits.push({ op: 'set_label', detectionId: id, label: choice.label });
                      }
                    }
                    if (choice.legendRowId !== undefined) {
                      for (const id of ids) {
                        edits.push({ op: 'assign_legend', detectionId: id, legendRowId: choice.legendRowId });
                      }
                    }
                    edits.push(...buildSaveReviewEdits({ ...plan, ids }, view.detections));
                    if (edits.length === 0) {
                      announce('info', t('detection.nothingToSave'));
                      return false;
                    }
                    const next = await commitEdits(edits);
                    if (!next) return false;
                    const saved = ids.filter((id) => {
                      const row = next.detections.find((item) => item.id === id);
                      if (!row) return false;
                      if (choice.confirm) return row.status === 'confirmed';
                      return (choice.typeKey ?? null) === (row.typeKey ?? null) || Boolean(choice.label);
                    }).length;
                    const message =
                      plan.skippedCount > 0
                        ? t('detection.savedPartial', {
                            saved,
                            requested: plan.requestedCount,
                            skipped: plan.skippedCount,
                          })
                        : choice.confirm
                          ? saved === 1
                            ? t('detection.savedAndConfirmedOne')
                            : t('detection.savedAndConfirmed', { count: saved })
                          : saved === 1
                            ? t('detection.savedWithoutConfirmOne')
                            : t('detection.savedWithoutConfirm', { count: saved });
                    announce('success', message);
                    const nextGroups = buildReviewGroups(next.detections);
                    const still = nextGroups.findIndex((group) => group.key === activeGuide.key);
                    if (still < 0) {
                      setCompletedReviewKeys((prev) =>
                        prev.includes(activeGuide.key) ? prev : [...prev, activeGuide.key],
                      );
                      const nextIndex = Math.min(guideIndex, Math.max(0, nextGroups.length - 1));
                      setGuideIndex(nextIndex);
                      focusGuide(nextGroups[nextIndex] ?? null);
                    }
                    return true;
                  };
                  lastSaveRetryRef.current = run;
                  return run();
                }}
              />
            ) : (
              <p className="text-xs text-[var(--pf-text-muted)]">{t('guide.done')}</p>
            )}
            <ul className="overflow-hidden rounded-lg border border-[var(--pf-border-default)]">
              {reviewGroups.length === 0 ? (
                <li className="p-2 text-xs text-[var(--pf-text-muted)]">{t('review.empty')}</li>
              ) : (
                reviewGroups.map((group, index) => {
                  const sample = view.detections.find((item) => item.id === group.focusId);
                  const label = sample
                    ? detectionDisplayLabel(sample, view.catalog, t('detection.unclassified'))
                    : t('detection.unclassified');
                  const status = sample ? t(`guide.plain.${reviewPlainKey(sample)}`) : t(`guide.kindShort.${group.kind}`);
                  const hostSheet = sample
                    ? view.sheets.find((item) => item.sheetKey === sample.sheetKey)
                    : undefined;
                  return (
                    <li key={group.key} className="border-b border-[var(--pf-border-default)] last:border-b-0">
                      <button
                        type="button"
                        data-testid="takeoff-detection-row"
                        aria-label={t('detection.groupAria', {
                          type: label,
                          quantity: group.occurrences,
                          status,
                        })}
                        className={`flex min-h-11 w-full min-w-0 items-start gap-2 px-2 py-1 text-start text-xs hover:bg-[var(--pf-action-subtle-hover)] ${group.key === activeGuide?.key ? 'bg-[var(--pf-action-subtle-hover)]' : ''}`}
                        onClick={() => {
                          setGuideIndex(index);
                          focusGuide(group);
                        }}
                      >
                        {sample ? (
                          <TakeoffSymbolGlyph
                            detection={sample}
                            sheet={hostSheet}
                            svgMarkup={cadGlyphs[sample.signature ? `sig:${sample.signature}` : sample.id] ?? cadGlyphs[sample.id]}
                            mode="thumb"
                            highlight={false}
                            className="size-10 shrink-0"
                            testId="takeoff-group-glyph"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-medium text-[var(--pf-text-primary)]">{label}</span>
                          <span className="block text-[11px] text-[var(--pf-status-warning-fg)]">{status}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold text-[var(--pf-text-brand)]">{group.occurrences}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className={`flex-col gap-2 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${sideTab === 'sheet' ? 'flex' : 'hidden'}`}>
            <section ref={sheetsPanelRef} className="min-w-0 shrink-0">
              <TakeoffSheetControls
                key={`${sheet.sheetKey}-${sheet.floorLabel ?? ''}-${sheet.scale.ratio ?? ''}-${sheet.scale.verified}`}
                sheet={sheet}
                readOnly={readOnly}
                onApply={(edit) => queueEdit(edit)}
              />
              <div className="mt-2">
                <TakeoffTypeFilterChips catalog={state.view.catalog} filter={state.typeFilter} onChange={setFilter} />
              </div>
              {(view.legend ?? []).some((row) => !row.typeKey && !row.continuation) || legendExemplars.length > 0 ? (
                <section aria-label={t('detection.undecodedLegendTitle')} data-testid="takeoff-undecoded-legend" className="mt-2 min-w-0 overflow-x-hidden rounded-lg border border-[var(--pf-border-default)] p-2">
                  <p className="text-xs font-medium text-[var(--pf-text-primary)]">{t('detection.undecodedLegendTitle')}</p>
                  <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('detection.undecodedLegendHint')}</p>
                  <div className="mb-1 min-w-0">
                    <p className="mb-1 text-xs text-[var(--pf-text-secondary)]">{t('detection.pickType')}</p>
                    <TakeoffTypePicker
                      catalog={view.catalog}
                      value={legendLibraryType}
                      disabled={readOnly}
                      testId="takeoff-legend-library-type"
                      onChange={setLegendLibraryType}
                      canManageCatalog={view.permissions.canManageLibrary}
                      mutations={catalogMutations}
                      onCatalogSaved={onCatalogSaved}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(view.legend ?? [])
                      .filter((row) => !row.typeKey && !row.continuation)
                      .map((row) => (
                      <div key={row.key} className="flex max-w-full flex-wrap items-center gap-1">
                        <button
                          type="button"
                          data-testid="takeoff-legend-exemplar"
                          data-legend-key={row.key}
                          data-count={row.count ?? 0}
                          className="min-h-11 max-w-full truncate rounded-md border border-[var(--pf-border-default)] px-2 text-start text-xs hover:bg-[var(--pf-action-subtle-hover)]"
                          onClick={() => {
                            const hostId = firstPlanOccurrenceId(view.detections, (mark) =>
                              Boolean(mark.legendRowIds?.includes(row.key)),
                            );
                            if (!hostId) return;
                            const host = view.sheets.find((item) =>
                              detectionsForSheet(view.detections, item).some((mark) => mark.id === hostId),
                            );
                            setState((current) => ({
                              ...current,
                              selectedDetectionId: hostId,
                              activeSheetKey: host ? sheetRefId(host) : current.activeSheetKey,
                              mobilePanel: 'plan',
                            }));
                          }}
                        >
                          {t('detection.undecodedLegendRow', { key: legendDisplayText(row), count: row.count ?? 0 })}
                        </button>
                        {view.permissions.canManageLibrary ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          data-testid="takeoff-legend-save-library"
                          data-legend-key={row.key}
                          data-count={row.count ?? 0}
                          disabled={readOnly || !legendLibraryType}
                          onClick={() => {
                            const edit = buildLegendLibraryEdit(row.key, legendLibraryType);
                            if (edit) queueEdit(edit);
                          }}
                        >
                          {t('detection.saveToLibrary')}
                        </Button>
                        ) : null}
                      </div>
                    ))}
                    {legendExemplars.length > 0 && (view.legend ?? []).length === 0
                      ? legendExemplars.map((row) => (
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
                      </div>
                    ))
                      : null}
                  </div>
                </section>
              ) : null}
              <TakeoffSheetsPanel
                view={view}
                readOnly={readOnly}
                onQueueEdit={(edit) => queueEdit(edit)}
                onFocusSheet={(refId) => {
                  setFocusMode('split');
                  setState((s) => ({ ...s, activeSheetKey: refId, mobilePanel: 'plan' }));
                }}
              />
            </section>
          </div>
        </section>
      </div>

      {selected ? (
        <TakeoffDetectionSheet
          key={selected.id}
          detection={selected}
          detections={view.detections}
          catalog={state.view.catalog}
          readOnly={readOnly}
          groupSize={selectedSymbolGroup.length}
          defaultApplyToGroup={selectedSymbolGroup.length > 1 && !legendConflictOnDetection(selected)}
          canManageLibrary={view.permissions.canManageLibrary}
          canManageCatalog={view.permissions.canManageLibrary}
          catalogMutations={catalogMutations}
          onCatalogSaved={onCatalogSaved}
          legendRows={view.legend ?? []}
          reasonLabel={reasonLabel}
          saving={guideSaving}
          feedback={actionFeedback}
          onRetry={() => {
            void lastSaveRetryRef.current?.();
          }}
          onClose={() => setState((s) => ({ ...s, selectedDetectionId: null }))}
          onExcludeFromBoq={(input) => {
            const ids = resolveExcludeFromBoqIds({
              selected,
              detections: view.detections,
              applyToGroup: input.applyToGroup,
              explicitGroupConfirm: input.explicitGroupConfirm,
            });
            const edits = buildExcludeFromBoqEdits(ids);
            if (edits.length === 0) return;
            void commitEdits(edits).then((next) => {
              if (!next) return;
              announce(
                'success',
                ids.length === 1 ? t('detection.excludedFromBoqOne') : t('detection.excludedFromBoq', { count: ids.length }),
              );
              advanceAfterExclude(next, ids);
            });
          }}
          onRestoreToBoq={() => {
            const edits = buildRestoreToBoqEdits([selected.id]);
            if (edits.length === 0) return;
            void commitEdits(edits).then((next) => {
              if (!next) return;
              announce('success', t('detection.restoredToReview'));
            });
          }}
          onSetLabel={(label) => {
            const edits = buildSetLabelEdits(
              detectionsSharingBoqItem(selected.id, view.boq.lines),
              label,
            );
            if (edits.length === 0) return;
            void commitEdits(edits).then((next) => {
              if (next) announce('success', t('detection.legendDescriptionSaved'));
            });
          }}
          onCommit={(input) => {
            const run = async () => {
              const plan = resolveSaveReviewPlan({
                selected,
                detections: view.detections,
                applyToGroup: input.applyToGroup,
                typeKey: input.typeKey,
                confirm: input.confirm,
                saveToLibrary: input.saveToLibrary,
                explicitGroupConfirm: input.explicitGroupConfirm,
              });
              const edits = buildSaveReviewEdits(plan, view.detections);
              if (edits.length === 0) {
                announce('info', t('detection.nothingToSave'));
                return false;
              }
              const next = await commitEdits(edits);
              if (!next) return false;
              const saved = plan.ids.filter((id) => {
                const row = next.detections.find((item) => item.id === id);
                if (!row) return false;
                if (input.confirm) return row.status === 'confirmed';
                return (input.typeKey ?? null) === (row.typeKey ?? null);
              }).length;
              const message =
                plan.skippedCount > 0
                  ? t('detection.savedPartial', {
                      saved,
                      requested: plan.requestedCount,
                      skipped: plan.skippedCount,
                    })
                  : input.confirm
                    ? saved === 1
                      ? t('detection.savedAndConfirmedOne')
                      : t('detection.savedAndConfirmed', { count: saved })
                    : saved === 1
                      ? t('detection.savedWithoutConfirmOne')
                      : t('detection.savedWithoutConfirm', { count: saved });
              announce('success', message);
              if (input.confirm) {
                const groupIds = sameSymbolDetections(selected, next.detections).map((item) => item.id);
                const nextId =
                  nextUnconfirmedId(selected.id, groupIds, next.detections) ??
                  nextUnconfirmedId(
                    selected.id,
                    next.detections.map((item) => item.id),
                    next.detections,
                  );
                if (nextId) focusOccurrence(nextId);
              }
              return true;
            };
            lastSaveRetryRef.current = run;
            void run();
          }}
          onSetNote={(tagText) => queueEdit({ op: 'set_note', detectionId: selected.id, tagText })}
          onDelete={() => {
            void commitEdits([{ op: 'delete', detectionId: selected.id }]).then((next) => {
              if (next) announce('success', t('detection.deleted'));
            });
          }}
          onRestore={() => {
            void commitEdits([{ op: 'restore', detectionId: selected.id }]).then((next) => {
              if (next) announce('success', t('detection.restored'));
            });
          }}
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