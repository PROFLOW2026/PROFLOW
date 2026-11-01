'use client';

import { ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getCaptureDetailAction,
  openCaptureInCloudAction,
  removeCaptureAction,
  saveMarkingsAction,
  updateCaptureAction,
} from '../actions';
import { locationLabel } from '../domain/filters';
import type { DraftMarking } from '../domain/markings';
import {
  INFRA_ROLE_LABELS,
  INFRA_TYPE_LABELS,
  type InfraCaptureDetailDto,
  type InfraCaptureDto,
  type InfraLocationOption,
  type InfraPermissions,
  type InfraType,
  type InfraViewer,
} from '../domain/types';
import type { QueueDetails } from '../domain/upload-queue';
import { InfraDetailsForm } from './infra-details-form';
import { evidenceFileUrl, formatDateTime, uploadBytes } from './infra-client';
import { InfraLocationSelect } from './infra-location-select';
import { InfraMarkingEditor, type MarkingEditorSave } from './infra-marking-editor';
import { INFRA_TEXT } from './texts';

export type LocateSlot = 'before' | 'after' | 'live';

function detailsOf(capture: InfraCaptureDto): QueueDetails {
  return {
    description: capture.description ?? '',
    room: capture.room ?? '',
    wall: capture.wall ?? '',
    infraType: capture.infraType ?? '',
    dimensions: capture.dimensions ?? '',
    note: capture.note ?? '',
    role: capture.role,
  };
}

export function InfraCaptureDialog({
  capture,
  viewer,
  organizationId,
  locations,
  permissions,
  suggestions,
  allowCloudLink,
  onClose,
  onChanged,
  onSelectForLocate,
}: {
  readonly capture: InfraCaptureDto;
  readonly viewer: InfraViewer;
  readonly organizationId: string;
  readonly locations: readonly InfraLocationOption[];
  readonly permissions: InfraPermissions;
  readonly suggestions: { readonly rooms: readonly string[]; readonly walls: readonly string[] };
  readonly allowCloudLink: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
  readonly onSelectForLocate: (capture: InfraCaptureDto, slot: LocateSlot) => void;
}) {
  const [detail, setDetail] = useState<InfraCaptureDetailDto | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'marks'>('view');
  const [showMarked, setShowMarked] = useState(Boolean(capture.latestAnnotatedEvidenceId));
  const [locationId, setLocationId] = useState<string | null>(capture.locationId);
  const [details, setDetails] = useState<QueueDetails>(() => detailsOf(capture));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await getCaptureDetailAction(viewer, { captureId: capture.id, organizationId });
    if (result.ok) setDetail(result.data);
  }, [viewer, capture.id, organizationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load detail when opened
    void reload();
  }, [reload]);

  const current = detail ?? { ...capture, versions: [], markings: [] };
  const annotatedId = current.latestAnnotatedEvidenceId;
  const originalUrl = evidenceFileUrl(viewer, capture.evidenceId);
  const shownUrl = showMarked && annotatedId ? evidenceFileUrl(viewer, annotatedId) : originalUrl;
  const available = capture.status === 'available';

  const initialMarkings = useMemo<DraftMarking[]>(
    () =>
      current.markings.map((marking) => ({
        kind: marking.kind,
        points: marking.points,
        label: marking.label,
        infraType: marking.infraType,
        color: marking.color,
      })),
    [current.markings],
  );

  async function saveEdit() {
    setBusy(true);
    setError(null);
    const result = await updateCaptureAction(viewer, {
      captureId: capture.id,
      organizationId,
      locationId: locationId && locationId !== capture.locationId ? locationId : null,
      details: {
        description: details.description,
        room: details.room,
        wall: details.wall,
        infraType: (details.infraType || null) as InfraType | null,
        dimensions: details.dimensions,
        note: details.note,
        role: details.role,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMode('view');
    setNotice(INFRA_TEXT.gallery.saved);
    onChanged();
    onClose();
  }

  async function saveMarks({ markings, annotated }: MarkingEditorSave): Promise<string | null> {
    const result = await saveMarkingsAction(viewer, {
      captureId: capture.id,
      organizationId,
      markings: markings.map((marking) => ({
        kind: marking.kind,
        points: marking.points.map((point) => [point[0], point[1]] as [number, number]),
        label: marking.label ?? null,
        infraType: marking.infraType ?? null,
        color: marking.color,
      })),
      annotated: { fileName: annotated.name, mimeType: annotated.type, sizeBytes: annotated.size },
    });
    if (!result.ok) return result.error;
    const upload = await uploadBytes(result.data.uploadUrl, annotated, 'image/jpeg');
    if (!upload.ok) return upload.error ?? INFRA_TEXT.retry;
    await reload();
    setShowMarked(true);
    onChanged();
    return null;
  }

  async function remove() {
    if (!window.confirm(INFRA_TEXT.gallery.removeConfirm)) return;
    setBusy(true);
    const result = await removeCaptureAction(viewer, { captureId: capture.id, organizationId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
    onClose();
  }

  async function openCloud() {
    setBusy(true);
    setError(null);
    const result = await openCaptureInCloudAction({ captureId: capture.id });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!result.data.url) {
      setError(INFRA_TEXT.gallery.cloudUnavailable);
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  }

  const authorName =
    capture.createdBy.displayName ??
    (capture.createdBy.type === 'external' ? INFRA_TEXT.gallery.contractor : INFRA_TEXT.gallery.unknownUser);
  const label = locationLabel(locations, capture.locationId) ?? '';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-testid="infra-capture-dialog">
        <DialogHeader>
          <DialogTitle>{capture.description || label || capture.fileName}</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {mode === 'marks' ? (
            <InfraMarkingEditor imageUrl={originalUrl} initial={initialMarkings} onSave={saveMarks} onCancel={() => setMode('view')} />
          ) : (
            <>
              {available ? (
                <div className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shownUrl} alt={capture.description ?? capture.fileName} className="max-h-[50dvh] w-full rounded-md bg-black object-contain" />
                  {annotatedId ? (
                    <div className="flex gap-2" role="group">
                      <Button type="button" size="sm" variant={showMarked ? 'secondary' : 'primary'} aria-pressed={!showMarked} onClick={() => setShowMarked(false)}>
                        {INFRA_TEXT.gallery.original}
                      </Button>
                      <Button type="button" size="sm" variant={showMarked ? 'primary' : 'secondary'} aria-pressed={showMarked} onClick={() => setShowMarked(true)}>
                        {INFRA_TEXT.gallery.markedVersion}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Alert tone="info">{INFRA_TEXT.gallery.pending}</Alert>
              )}

              {mode === 'edit' ? (
                <div className="flex flex-col gap-3">
                  <InfraLocationSelect
                    locations={locations}
                    value={locationId}
                    onChange={setLocationId}
                    label={INFRA_TEXT.gallery.moveTo}
                    placeholder={INFRA_TEXT.capture.locationPlaceholder}
                    required
                    testId="infra-edit-location"
                  />
                  <InfraDetailsForm value={details} suggestions={suggestions} onChange={(patch) => setDetails((value) => ({ ...value, ...patch }))} />
                </div>
              ) : (
                <dl className="grid min-w-0 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <Meta label={INFRA_TEXT.gallery.by} value={authorName} />
                  <Meta label={INFRA_TEXT.gallery.at} value={formatDateTime(capture.capturedAt)} />
                  <Meta label={INFRA_TEXT.details.room} value={capture.room} />
                  <Meta label={INFRA_TEXT.details.wall} value={capture.wall} />
                  <Meta label={INFRA_TEXT.details.infraType} value={capture.infraType ? INFRA_TYPE_LABELS[capture.infraType] : null} />
                  <Meta label={INFRA_TEXT.details.dimensions} value={capture.dimensions} />
                  <Meta label={INFRA_TEXT.details.role} value={INFRA_ROLE_LABELS[capture.role]} />
                  <Meta label={INFRA_TEXT.details.note} value={capture.note} wide />
                  {current.versions.length > 0 ? (
                    <Meta label={INFRA_TEXT.gallery.versions} value={`${current.versions.length}`} />
                  ) : null}
                </dl>
              )}
            </>
          )}
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </DialogBody>
        {mode !== 'marks' ? (
          <DialogFooter className="flex-wrap">
            {mode === 'edit' ? (
              <>
                <Button type="button" onClick={() => void saveEdit()} disabled={busy || !locationId} data-testid="infra-edit-save">
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {INFRA_TEXT.save}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setMode('view')}>
                  {INFRA_TEXT.cancel}
                </Button>
              </>
            ) : (
              <>
                {available && permissions.canDocument ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => onSelectForLocate(capture, 'before')} data-testid="infra-select-before">
                      {INFRA_TEXT.gallery.selectForBefore}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => onSelectForLocate(capture, 'after')} data-testid="infra-select-after">
                      {INFRA_TEXT.gallery.selectForAfter}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => onSelectForLocate(capture, 'live')} data-testid="infra-select-live">
                      {INFRA_TEXT.gallery.selectForLive}
                    </Button>
                  </>
                ) : null}
                {capture.canEdit && available ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => setMode('marks')} data-testid="infra-edit-marks">
                      <Pencil aria-hidden />
                      {INFRA_TEXT.gallery.editMarks}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setMode('edit')} data-testid="infra-edit-details">
                      {INFRA_TEXT.edit}
                    </Button>
                  </>
                ) : null}
                {allowCloudLink && available ? (
                  <Button type="button" variant="ghost" onClick={() => void openCloud()} disabled={busy}>
                    <ExternalLink aria-hidden />
                    {INFRA_TEXT.gallery.openCloud}
                  </Button>
                ) : null}
                {capture.canEdit ? (
                  <Button type="button" variant="dangerGhost" onClick={() => void remove()} disabled={busy}>
                    <Trash2 aria-hidden />
                    {INFRA_TEXT.remove}
                  </Button>
                ) : null}
              </>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value, wide }: { readonly label: string; readonly value: string | null; readonly wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={`flex min-w-0 gap-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="shrink-0 text-[var(--pf-text-secondary)]">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
