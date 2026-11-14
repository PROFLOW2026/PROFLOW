'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Cloud, Upload, X } from 'lucide-react';
import { ProjectCloudFilePicker } from '@/modules/external-storage/client';
import type {
  ProjectCloudFileBrowserActions,
  ProjectCloudFileRef,
} from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { useTakeoffApi } from './api-provider';
import { uploadFileInChunks, validateTakeoffFile, type ChunkUploadProgress } from './upload-client';
import { TakeoffJobProgress } from './takeoff-job-progress';
import { buildWizardSheetSelection } from './wizard-sheet-selection';

interface PendingFile {
  source: 'upload' | 'cloud';
  name: string;
  file?: File;
  kind: 'pdf' | 'dwg' | 'dxf';
  progress: number;
  fileId: string | null;
  error: string | null;
}

export function TakeoffUploadWizard({
  projectId,
  uploadApiBase,
  cloudBrowserActions,
  onClose,
  onStarted,
}: {
  projectId: string;
  uploadApiBase: string;
  cloudBrowserActions?: ProjectCloudFileBrowserActions;
  onClose: () => void;
  onStarted: (analysisId: string) => void;
}) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [plannerKey, setPlannerKey] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [ruleSetId, setRuleSetId] = useState<string>('');
  const [ruleSets, setRuleSets] = useState<{ id: string; name: string }[]>([]);
  const [pairPdfName, setPairPdfName] = useState('');
  const [pairDwgName, setPairDwgName] = useState('');
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [dwgLayouts, setDwgLayouts] = useState('');
  const [canPickFromCloud, setCanPickFromCloud] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);
  const [cloudLinkBusy, setCloudLinkBusy] = useState(false);
  const lastRunRef = useRef<{
    fileIds: string[];
    pairing?: { pdfFileId: string; dwgFileId: string }[];
    sheetKeys: string[];
    ruleSetId?: string;
    useAi: boolean;
  } | null>(null);

  useEffect(() => {
    void api.listRuleSets(projectId).then((rows) => {
      setRuleSets(rows.map((r) => ({ id: r.id, name: r.name })));
      if (rows[0]) setRuleSetId(rows[0].id);
    });
    void api.getTakeoffInputCapabilities(projectId).then((caps) => {
      setCanPickFromCloud(caps.canPickFromProjectCloud);
      setEphemeralMode(caps.persistenceDefault === 'ephemeral');
    });
  }, [api, projectId]);

  const ensureAnalysisId = useCallback(async (): Promise<string> => {
    if (analysisId) return analysisId;
    const summary = await api.createAnalysis(projectId, {
      name: t('list.defaultName'),
      plannerKey: plannerKey.trim() || undefined,
    });
    setAnalysisId(summary.id);
    return summary.id;
  }, [analysisId, api, plannerKey, projectId, t]);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const next: PendingFile[] = [];
      for (const file of list) {
        const v = validateTakeoffFile(file);
        if (!v.ok) {
          setFormError(t(v.messageKey));
          continue;
        }
        next.push({ source: 'upload', file, name: file.name, kind: v.kind, progress: 0, fileId: null, error: null });
      }
      if (next.length) {
        setFiles((prev) => [...prev, ...next]);
        setSelectedSheets((prev) => {
          const names = new Set(prev);
          for (const row of next) names.add(row.name);
          return names;
        });
        setFormError(null);
      }
    },
    [t],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const uploadAll = async (aid: string): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const row = files[i]!;
      if (row.source === 'cloud' && row.fileId) {
        ids.push(row.fileId);
        continue;
      }
      if (!row.file) continue;
      const begin = await api.beginFileUpload(aid, {
        name: row.file.name,
        sizeBytes: row.file.size,
        kind: row.kind,
      });
      const onProgress = (p: ChunkUploadProgress) => {
        setFiles((prev) => {
          const copy = [...prev];
          const item = copy[i];
          if (!item) return prev;
          copy[i] = { ...item, progress: p.uploadedBytes / p.totalBytes, fileId: begin.fileId };
          return copy;
        });
      };
      await uploadFileInChunks({
        file: row.file,
        fileId: begin.fileId,
        chunkBytes: begin.chunkBytes,
        uploadBase: uploadApiBase,
        onProgress,
      });
      setFiles((prev) => {
        const copy = [...prev];
        const item = copy[i];
        if (item) copy[i] = { ...item, fileId: begin.fileId, progress: 1 };
        return copy;
      });
      setSelectedSheets((prev) => {
        const next = new Set(prev);
        next.add(row.name);
        next.add(begin.fileId);
        return next;
      });
      ids.push(begin.fileId);
    }
    return ids;
  };

  const runAnalysis = async () => {
    if (!files.length) {
      setFormError(t('upload.errors.noFiles'));
      return;
    }
    setBusy(true);
    try {
      const aid = await ensureAnalysisId();
      const fileIds = await uploadAll(aid);
      const pdfId = files.find((f) => f.name === pairPdfName)?.fileId;
      const dwgId = files.find((f) => f.name === pairDwgName)?.fileId;
      const pairing = pdfId && dwgId ? [{ pdfFileId: pdfId, dwgFileId: dwgId }] : undefined;
      const included = files
        .filter((f) => f.fileId && (selectedSheets.has(f.name) || selectedSheets.has(f.fileId)))
        .map((f) => f.fileId!);
      const sheetKeys = included.length ? included : fileIds;
      const sheetSelection = buildWizardSheetSelection(
        files.map((f) => ({ fileId: f.fileId, kind: f.kind, name: f.name })),
        selectedSheets,
        dwgLayouts,
      );
      const startInput = {
        fileIds,
        pairing,
        sheetKeys,
        sheetSelection: sheetSelection.length > 0 ? sheetSelection : undefined,
        ruleSetId: ruleSetId || undefined,
        useAi,
      };
      lastRunRef.current = startInput;
      const { jobId: startedJob } = await api.startAnalysis(aid, startInput);
      setJobId(startedJob);
      if (useAi) {
        setFormError(null);
      }
    } catch {
      setFormError(t('upload.errors.failed'));
      setBusy(false);
    }
  };

  const rerunAnalysis = async () => {
    if (!analysisId || !lastRunRef.current) {
      setJobId(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const { jobId: startedJob } = await api.startAnalysis(analysisId, lastRunRef.current);
      setJobId(startedJob);
    } catch {
      setFormError(t('upload.errors.failed'));
      setJobId(null);
      setBusy(false);
    }
  };

  const pdfFiles = files.filter((f) => f.kind === 'pdf');
  const dwgFiles = files.filter((f) => f.kind === 'dwg' || f.kind === 'dxf');

  const linkCloudFile = async (ref: ProjectCloudFileRef) => {
    setCloudLinkBusy(true);
    setFormError(null);
    try {
      const aid = await ensureAnalysisId();
      const linked = await api.linkCloudFile(aid, {
        providerFileId: ref.providerFileId,
        fileName: ref.fileName,
        mimeType: ref.mimeType,
        parentFolderId: ref.parentFolderId,
      });
      setFiles((prev) => [
        ...prev,
        {
          source: 'cloud',
          name: ref.fileName,
          kind: linked.kind,
          progress: 1,
          fileId: linked.fileId,
          error: null,
        },
      ]);
      setSelectedSheets((prev) => {
        const next = new Set(prev);
        next.add(ref.fileName);
        next.add(linked.fileId);
        return next;
      });
      setCloudPickerOpen(false);
    } catch {
      setFormError(t('upload.errors.cloudLinkFailed'));
    } finally {
      setCloudLinkBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="flex max-h-[92dvh] w-full min-w-0 max-w-[min(32rem,100vw)] flex-col overflow-x-hidden overflow-y-hidden rounded-t-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-[var(--pf-border-default)] px-4 py-3">
          <h2 className="text-base font-semibold">{t('upload.title')}</h2>
          <Button type="button" variant="ghost" className="min-h-11 min-w-11" onClick={onClose} aria-label={t('common.close')}>
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {jobId ? (
            <TakeoffJobProgress
              jobId={jobId}
              onDone={() => {
                setBusy(false);
                if (analysisId) onStarted(analysisId);
              }}
              onRetry={() => void rerunAnalysis()}
              onClose={() => {
                setJobId(null);
                setBusy(false);
              }}
            />
          ) : (
            <>
              <div
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)] p-4 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                }}
              >
                <Upload className="size-6 text-[var(--pf-text-muted)]" />
                <p className="text-sm text-[var(--pf-text-secondary)]">{t('upload.dropHint')}</p>
                <p className="text-xs text-[var(--pf-text-muted)]">{t('upload.typesHint')}</p>
                <input
                  ref={inputRef}
                  data-testid="takeoff-upload-input"
                  type="file"
                  className="sr-only"
                  multiple
                  accept=".pdf,.dwg,.dxf,application/pdf"
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
              {canPickFromCloud && cloudBrowserActions ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 w-full"
                    data-testid="takeoff-pick-project-file"
                    disabled={cloudLinkBusy}
                    onClick={() => setCloudPickerOpen(true)}
                  >
                    <Cloud className="size-4" aria-hidden />
                    {t('upload.pickFromProject')}
                  </Button>
                  <ProjectCloudFilePicker
                    projectId={projectId}
                    open={cloudPickerOpen}
                    onOpenChange={setCloudPickerOpen}
                    browserActions={cloudBrowserActions}
                    title={t('upload.pickFromProject')}
                    description={t('upload.pickFromProjectHint')}
                    onSelect={(ref) => void linkCloudFile(ref)}
                  />
                </div>
              ) : null}
              {ephemeralMode ? (
                <p className="text-xs text-[var(--pf-text-secondary)]" role="note">
                  {t('upload.ephemeralHint')}
                </p>
              ) : null}
              {formError ? (
                <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
                  {formError}
                </p>
              ) : null}
              <label className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('upload.plannerKey')}</label>
              <input
                data-testid="takeoff-planner-key"
                className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-3 text-sm"
                value={plannerKey}
                onChange={(e) => setPlannerKey(e.target.value)}
                placeholder={t('upload.plannerPlaceholder')}
              />
              <label className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('upload.ruleSet')}</label>
              <select
                className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-3 text-sm"
                value={ruleSetId}
                onChange={(e) => setRuleSetId(e.target.value)}
              >
                {ruleSets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  data-testid="takeoff-ai-toggle"
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                />
                {t('upload.aiToggle')}
              </label>
              <p className="text-xs text-[var(--pf-text-muted)]">{useAi ? t('limitations.aiOn') : t('upload.aiOff')}</p>
              {dwgFiles.length > 0 ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--pf-text-secondary)]" htmlFor="takeoff-dwg-layouts">
                    {t('upload.dwgLayouts')}
                  </label>
                  <textarea
                    id="takeoff-dwg-layouts"
                    data-testid="takeoff-dwg-layouts"
                    className="min-h-[4.5rem] w-full rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
                    value={dwgLayouts}
                    onChange={(e) => setDwgLayouts(e.target.value)}
                    placeholder={t('upload.dwgLayoutsPlaceholder')}
                  />
                  <p className="text-[10px] text-[var(--pf-text-muted)]">{t('upload.dwgLayoutsHint')}</p>
                </div>
              ) : null}
              <ul className="flex flex-col gap-2">
                {files.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex min-w-0 flex-col gap-1 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs uppercase text-[var(--pf-text-muted)]">{f.kind}</span>
                    </span>
                    {f.fileId ? (
                      <span className="text-[10px] text-[var(--pf-text-muted)]">ID: {f.fileId.slice(0, 8)}…</span>
                    ) : null}
                    <label className="flex min-h-11 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedSheets.has(f.name) || (f.fileId ? selectedSheets.has(f.fileId) : false)}
                        onChange={() => {
                          setSelectedSheets((prev) => {
                            const next = new Set(prev);
                            const keys = [f.name, f.fileId].filter(Boolean) as string[];
                            const on = keys.some((k) => next.has(k));
                            for (const k of keys) {
                              if (on) next.delete(k);
                              else next.add(k);
                            }
                            return next;
                          });
                        }}
                      />
                      {t('upload.includeSheet')}
                    </label>
                    {f.progress > 0 && f.progress < 1 ? (
                      <div className="h-1 overflow-hidden rounded-full bg-[var(--pf-bg-muted)]">
                        <div className="h-full bg-[var(--pf-action-primary)]" style={{ width: `${f.progress * 100}%` }} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {pdfFiles.length > 0 && dwgFiles.length > 0 ? (
                <div className="space-y-1 rounded-md border border-dashed border-[var(--pf-border-default)] p-2">
                  {!pairPdfName || !pairDwgName ? (
                    <p
                      className="rounded-md bg-[var(--pf-status-warning-bg)] px-2 py-1 text-xs text-[var(--pf-status-warning-fg)]"
                      role="note"
                      data-testid="takeoff-unpaired-warning"
                    >
                      {t('upload.unpairedWarning')}
                    </p>
                  ) : null}
                  <p className="text-xs font-medium">{t('upload.pairing')}</p>
                  {pairPdfName && pairDwgName ? (
                    <p className="text-xs text-[var(--pf-status-success-fg)]" role="status">
                      {t('upload.pairingReady', { pdf: pairPdfName, dwg: pairDwgName })}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('upload.pairingHint')}</p>
                  )}
                  <select
                    data-testid="takeoff-pair-pdf"
                    className="min-h-11 w-full rounded-md border px-2 text-sm"
                    value={pairPdfName}
                    onChange={(e) => setPairPdfName(e.target.value)}
                  >
                    <option value="">{t('upload.pickPdf')}</option>
                    {pdfFiles.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid="takeoff-pair-dwg"
                    className="min-h-11 w-full rounded-md border px-2 text-sm"
                    value={pairDwgName}
                    onChange={(e) => setPairDwgName(e.target.value)}
                  >
                    <option value="">{t('upload.pickDwg')}</option>
                    {dwgFiles.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )}
        </div>
        {!jobId ? (
          <footer className="flex gap-2 border-t border-[var(--pf-border-default)] p-4">
            <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              data-testid="takeoff-start-analysis"
              className="min-h-11 flex-1"
              disabled={busy || !files.length}
              onClick={() => void runAnalysis()}
            >
              {t('upload.analyze')}
            </Button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}