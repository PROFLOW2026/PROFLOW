'use client';

import { Cloud, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ProjectCloudFilePicker } from '@/modules/external-storage/client';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { InfraOverlayTrial } from '@/modules/project-workspace/ui/infra-overlay-trial';
import type {
  InfraTrialAlignment,
  InfraTrialIntegration,
  InfraTrialInitial,
  InfraTrialPreset,
  InfraTrialSaveInput,
  InfraTrialSaveOptions,
  InfraTrialSaveOutcome,
} from '@/modules/project-workspace/ui/infra-trial-integration';
import { beginComparisonSaveAction, finalizeComparisonSaveAction, listComparisonsAction, removeComparisonAction } from '../actions';
import { parseAlignmentRecord } from '../domain/alignment-record';
import { locationLabel } from '../domain/filters';
import type { InfraComparisonDto, InfraLocationOption, InfraViewer } from '../domain/types';
import type { BeginComparisonInput } from '../domain/validation';
import { InfraGalleryPicker } from './infra-gallery-picker';
import { evidenceFileUrl, formatDateTime, newClientId, normalizeUploadMime, storageFileUrl, uploadBytes } from './infra-client';
import { flattenLocations } from './infra-location-select';
import { INFRA_TEXT } from './texts';

function meta(file: File) {
  return { fileName: file.name || 'photo.jpg', mimeType: normalizeUploadMime(file, file.name), sizeBytes: file.size };
}

function StoragePickButton({
  projectId,
  browserActions,
  onFile,
}: {
  readonly projectId: string;
  readonly browserActions: ProjectCloudFileBrowserActions;
  readonly onFile: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="infra-pick-storage">
        <Cloud aria-hidden />
        {INFRA_TEXT.locate.storage}
      </Button>
      {error ? (
        <span className="text-xs text-[var(--pf-status-danger-fg)]" role="alert">
          {error}
        </span>
      ) : null}
      <ProjectCloudFilePicker
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        browserActions={browserActions}
        title={INFRA_TEXT.capture.pickTitle}
        description={INFRA_TEXT.capture.pickDescription}
        onSelect={async (ref) => {
          setError(null);
          try {
            const response = await fetch(storageFileUrl(projectId, ref.providerFileId), { credentials: 'same-origin' });
            if (!response.ok) throw new Error('download');
            const blob = await response.blob();
            onFile(new File([blob], ref.fileName, { type: ref.mimeType || blob.type }));
          } catch {
            setError(INFRA_TEXT.locate.reopenFailed);
          }
        }}
      />
    </>
  );
}

export function InfraLocatePanel({
  viewer,
  projectId,
  organizationId,
  taskId,
  locations,
  defaultLocationId,
  canDocument,
  canManageCaptures,
  browserActions,
  preset,
  onSaved,
}: {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  readonly organizationId: string;
  readonly taskId: string | null;
  readonly locations: readonly InfraLocationOption[];
  readonly defaultLocationId: string | null;
  readonly canDocument: boolean;
  readonly canManageCaptures: boolean;
  readonly browserActions?: ProjectCloudFileBrowserActions;
  readonly preset: InfraTrialPreset | null;
  readonly onSaved: () => void;
}) {
  const [comparisons, setComparisons] = useState<InfraComparisonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reopen, setReopen] = useState<{ key: number; initial: InfraTrialInitial } | null>(null);
  const [trialKey, setTrialKey] = useState(0);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const pendingId = useRef<string | null>(null);
  const reopenCounter = useRef(0);

  const loadList = useCallback(async () => {
    setLoading(true);
    const result = await listComparisonsAction(viewer, { projectId, organizationId });
    setLoading(false);
    if (!result.ok) {
      setListError(result.error);
      return;
    }
    setListError(null);
    setComparisons(result.data);
  }, [viewer, projectId, organizationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void loadList();
  }, [loadList]);

  const onSave = useCallback(
    async (input: InfraTrialSaveInput, options: InfraTrialSaveOptions): Promise<InfraTrialSaveOutcome> => {
      // The same id across retries of one save makes begin idempotent (no duplicate files).
      pendingId.current ??= newClientId();
      const files = {
        before: options.saveBefore && input.beforeFile ? meta(input.beforeFile) : null,
        after: options.saveAfter && input.afterFile ? meta(input.afterFile) : null,
        result: options.saveResult && input.resultFile ? meta(input.resultFile) : null,
      };
      const begin = await beginComparisonSaveAction(viewer, {
        projectId,
        organizationId,
        locationId: options.locationId,
        taskId,
        clientComparisonId: pendingId.current,
        mode: input.mode,
        beforeCaptureId: input.beforeCaptureId,
        alignment: input.alignment as unknown as BeginComparisonInput['alignment'],
        reliable: input.reliable,
        note: options.note,
        files,
      });
      if (!begin.ok) return { ok: false, error: begin.error };
      const byslot = { before: input.beforeFile, after: input.afterFile, result: input.resultFile } as const;
      for (const upload of begin.data.uploads) {
        if (upload.alreadyUploaded) continue;
        const file = byslot[upload.slot];
        if (!file) continue;
        const sent = await uploadBytes(upload.uploadUrl, file, normalizeUploadMime(file, file.name));
        if (!sent.ok) return { ok: false, error: sent.error ?? INFRA_TEXT.retry };
      }
      const done = await finalizeComparisonSaveAction(viewer, { comparisonId: begin.data.comparisonId, organizationId });
      if (!done.ok) return { ok: false, error: done.error };
      pendingId.current = null;
      void loadList();
      onSaved();
      return { ok: true };
    },
    [viewer, projectId, organizationId, taskId, loadList, onSaved],
  );

  const flat = useMemo(() => flattenLocations(locations), [locations]);

  const integration = useMemo<InfraTrialIntegration>(
    () => ({
      locations: flat.map((item) => ({ id: item.id, label: item.label })),
      defaultLocationId,
      preset,
      renderPhotoSources: (_slot, onPhoto): ReactNode => (
        <>
          <InfraGalleryPicker
            viewer={viewer}
            projectId={projectId}
            organizationId={organizationId}
            locations={locations}
            defaultLocationId={defaultLocationId}
            onPick={(photo) => onPhoto(photo)}
          />
          {browserActions ? (
            <StoragePickButton projectId={projectId} browserActions={browserActions} onFile={(file) => onPhoto({ file })} />
          ) : null}
        </>
      ),
      onSave,
      initial: reopen?.initial ?? null,
      onExit: () => {
        setReopen(null);
        setTrialKey((value) => value + 1);
      },
    }),
    [flat, defaultLocationId, preset, viewer, projectId, organizationId, locations, browserActions, onSave, reopen],
  );

  function open(comparison: InfraComparisonDto) {
    setReopenError(null);
    const record = parseAlignmentRecord(comparison.alignment);
    if (!record || !comparison.beforeEvidenceId || !comparison.afterEvidenceId) {
      setReopenError(INFRA_TEXT.locate.reopenFailed);
      return;
    }
    const alignment: InfraTrialAlignment = {
      version: 1,
      kind: record.kind,
      beforePins: record.beforePins.map(([x, y]) => [x, y] as [number, number]),
      afterPins: record.afterPins.map(([x, y]) => [x, y] as [number, number]),
      // Without the stage the nudge cannot be scaled back safely, so it is dropped.
      adjust: record.stage ? (record.adjust ?? null) : null,
      stage: record.stage ?? { w: 1, h: 1 },
      opacity: record.opacity,
      view: record.view ?? null,
    };
    reopenCounter.current += 1;
    setReopen({
      key: reopenCounter.current,
      initial: {
        beforeUrl: evidenceFileUrl(viewer, comparison.beforeEvidenceId),
        afterUrl: evidenceFileUrl(viewer, comparison.afterEvidenceId),
        alignment,
      },
    });
    setTrialKey((value) => value + 1);
  }

  async function remove(comparison: InfraComparisonDto) {
    if (!window.confirm(INFRA_TEXT.gallery.removeConfirm)) return;
    const result = await removeComparisonAction(viewer, { comparisonId: comparison.id, organizationId });
    if (!result.ok) {
      setListError(result.error);
      return;
    }
    void loadList();
  }

  if (!canDocument) return <Alert tone="info">{INFRA_TEXT.noLocationsManage}</Alert>;

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="infra-locate-panel">
      <InfraOverlayTrial key={`${trialKey}-${reopen?.key ?? 0}`} projectId={projectId} integration={integration} />

      <section className="flex min-w-0 flex-col gap-2" aria-label={INFRA_TEXT.locate.saved}>
        <h3 className="text-sm font-semibold">{INFRA_TEXT.locate.saved}</h3>
        {reopenError ? <Alert tone="danger">{reopenError}</Alert> : null}
        {listError ? <Alert tone="danger">{listError}</Alert> : null}
        {loading ? (
          <div className="flex justify-center py-3" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : comparisons.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.locate.savedEmpty}</p>
        ) : (
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2" data-testid="infra-saved-comparisons">
            {comparisons.map((comparison) => {
              const thumb = comparison.resultEvidenceId ?? comparison.afterEvidenceId ?? comparison.beforeEvidenceId;
              const canRemove = canManageCaptures || comparison.createdBy.type === viewer;
              return (
                <li key={comparison.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--pf-border-default)] p-2">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={evidenceFileUrl(viewer, thumb)} alt="" loading="lazy" className="size-16 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="size-16 shrink-0 rounded-md bg-[var(--pf-bg-muted)]" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                    <span className="truncate font-medium">{locationLabel(locations, comparison.locationId) ?? ''}</span>
                    <span className="truncate text-xs text-[var(--pf-text-secondary)]">
                      {comparison.mode === 'live' ? INFRA_TEXT.locate.modeLiveLabel : INFRA_TEXT.locate.modeTwoLabel} ·{' '}
                      {comparison.reliable ? INFRA_TEXT.locate.reliable : INFRA_TEXT.locate.unreliable}
                    </span>
                    <span className="truncate text-[11px] text-[var(--pf-text-muted)]">
                      {formatDateTime(comparison.createdAt)}
                      {comparison.createdBy.displayName ? ` · ${comparison.createdBy.displayName}` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button type="button" size="sm" variant="secondary" onClick={() => open(comparison)} data-testid="infra-reopen-comparison">
                      {INFRA_TEXT.locate.reopen}
                    </Button>
                    {canRemove ? (
                      <Button type="button" size="sm" variant="dangerGhost" onClick={() => void remove(comparison)} aria-label={INFRA_TEXT.locate.removeResult}>
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
