'use client';

import { Camera, Check, ChevronDown, ImageUp, Loader2, RefreshCw, RotateCcw, Trash2, Video, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { locationLabel } from '../domain/filters';
import type { InfraLocationOption } from '../domain/types';
import { canApprove, canRetry, type QueueItem } from '../domain/upload-queue';
import { InfraCamera } from './infra-camera';
import { InfraDetailsForm } from './infra-details-form';
import { InfraLocationSelect } from './infra-location-select';
import { inspectPickedVideo } from './infra-video-file';
import { InfraVideoRecorder } from './infra-video-recorder';
import { formatVideoDuration } from '../domain/video';
import { INFRA_TEXT } from './texts';
import type { useInfraUploads } from './use-infra-uploads';

type Uploads = ReturnType<typeof useInfraUploads>;

const statusTone: Record<QueueItem['status'], string> = {
  pending_approval: 'bg-[var(--pf-status-warning-bg)] text-[var(--pf-status-warning-fg)]',
  approved: 'bg-[var(--pf-status-info-bg)] text-[var(--pf-status-info-fg)]',
  uploading: 'bg-[var(--pf-status-info-bg)] text-[var(--pf-status-info-fg)]',
  uploaded: 'bg-[var(--pf-status-success-bg)] text-[var(--pf-status-success-fg)]',
  failed: 'bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]',
  cancelled: 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]',
};

function QueueCard({
  item,
  uploads,
  locations,
  suggestions,
  onRetake,
}: {
  readonly item: QueueItem;
  readonly uploads: Uploads;
  readonly locations: readonly InfraLocationOption[];
  readonly suggestions: { readonly rooms: readonly string[]; readonly walls: readonly string[] };
  readonly onRetake: (item: QueueItem) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const preview = uploads.previews[item.clientId];
  const video = uploads.videos[item.clientId] ?? null;
  const uploadProgress = uploads.progress[item.clientId];
  const label = item.locationId ? locationLabel(locations, item.locationId) : null;
  const pending = item.status === 'pending_approval';

  return (
    <li
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
      data-testid="infra-queue-item"
      data-status={item.status}
    >
      <div className="flex min-w-0 items-start gap-3">
        {preview && video ? (
          <video
            src={preview}
            controls={pending}
            muted
            playsInline
            preload="metadata"
            className={`rounded-md border border-[var(--pf-border-default)] bg-black object-cover ${pending ? 'h-36 w-44 sm:h-44 sm:w-56' : 'size-16'}`}
            data-testid="infra-queue-video-preview"
          />
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className={`rounded-md border border-[var(--pf-border-default)] object-cover ${pending ? 'size-28 sm:size-36' : 'size-16'}`}
            data-testid="infra-queue-preview"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[item.status]}`}>
            {item.status === 'uploading' ? <Loader2 className="me-1 inline size-3 animate-spin" aria-hidden /> : null}
            {INFRA_TEXT.capture.status[item.status]}
            {item.status === 'uploading' && video && uploadProgress !== undefined ? ` ${Math.round(uploadProgress * 100)}%` : ''}
          </span>
          {video ? (
            <span className="flex w-fit items-center gap-1 text-xs text-[var(--pf-text-secondary)]">
              <Video className="size-3" aria-hidden />
              {INFRA_TEXT.video.badge} {formatVideoDuration(video.durationMs)}
            </span>
          ) : null}
          {label ? <span className="truncate text-sm">{label}</span> : null}
          {item.error ? (
            <span className="text-xs text-[var(--pf-status-danger-fg)]" role="alert">
              {item.error}
            </span>
          ) : null}
        </div>
      </div>

      {pending ? (
        <>
          <InfraLocationSelect
            locations={locations}
            value={item.locationId}
            onChange={(locationId) => uploads.edit(item.clientId, { locationId })}
            label={INFRA_TEXT.capture.location}
            placeholder={INFRA_TEXT.capture.locationPlaceholder}
            required
            testId="infra-item-location"
          />
          <button
            type="button"
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-[var(--pf-text-brand)]"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((value) => !value)}
          >
            <ChevronDown className={`size-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} aria-hidden />
            {INFRA_TEXT.capture.moreDetails}
          </button>
          {showDetails ? (
            <InfraDetailsForm
              value={item.details}
              suggestions={suggestions}
              onChange={(patch) => uploads.edit(item.clientId, { details: patch })}
            />
          ) : null}
          {!canApprove(item) ? (
            <p className="text-xs text-[var(--pf-status-warning-fg)]">{INFRA_TEXT.capture.approveNeedsLocation}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => uploads.approve(item.clientId)}
              disabled={!canApprove(item)}
              data-testid="infra-approve"
            >
              <Check aria-hidden />
              {INFRA_TEXT.capture.approve}
            </Button>
            <Button type="button" variant="secondary" onClick={() => onRetake(item)} data-testid="infra-retake">
              <RotateCcw aria-hidden />
              {INFRA_TEXT.capture.retake}
            </Button>
            <Button type="button" variant="ghost" onClick={() => uploads.discard(item.clientId)} data-testid="infra-cancel-photo">
              <X aria-hidden />
              {INFRA_TEXT.capture.cancelPhoto}
            </Button>
          </div>
        </>
      ) : null}

      {item.status === 'failed' ? (
        <div className="flex flex-wrap gap-2">
          {canRetry(item) ? (
            <Button type="button" size="sm" onClick={() => uploads.retry(item.clientId)} data-testid="infra-retry-upload">
              <RefreshCw aria-hidden />
              {INFRA_TEXT.capture.retryUpload}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="dangerGhost" onClick={() => uploads.discard(item.clientId)}>
            <Trash2 aria-hidden />
            {INFRA_TEXT.remove}
          </Button>
        </div>
      ) : null}

      {item.status === 'uploaded' ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => uploads.dismiss(item.clientId)} className="w-fit">
          {INFRA_TEXT.capture.dismiss}
        </Button>
      ) : null}
    </li>
  );
}

export function InfraCapturePanel({
  locations,
  locationId,
  onLocationChange,
  uploads,
  suggestions,
  taskTitle,
  storagePicker,
  canDocument,
  canCaptureVideo = false,
}: {
  readonly locations: readonly InfraLocationOption[];
  readonly locationId: string | null;
  readonly onLocationChange: (locationId: string | null) => void;
  readonly uploads: Uploads;
  readonly suggestions: { readonly rooms: readonly string[]; readonly walls: readonly string[] };
  readonly taskTitle: string | null;
  /** Storage browser button (only for viewers allowed to browse the connected storage). */
  readonly storagePicker?: (onFile: (file: File) => void) => ReactNode;
  readonly canDocument: boolean;
  /** Short-video recording (trial: owner / office accounts only). */
  readonly canCaptureVideo?: boolean;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoMessage, setVideoMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const nativeCapture = useRef<HTMLInputElement>(null);
  const nativePick = useRef<HTMLInputElement>(null);
  const nativeVideoPick = useRef<HTMLInputElement>(null);
  const items = uploads.items;

  const addRecordedVideo = (file: File, durationMs: number, autoStopped: boolean) => {
    setVideoOpen(false);
    setVideoMessage(autoStopped ? { tone: 'info', text: INFRA_TEXT.video.autoStopped } : null);
    uploads.addVideo(file, { locationId, source: 'camera', durationMs });
  };

  const addPickedVideo = async (file: File) => {
    const picked = await inspectPickedVideo(file);
    if (!picked.ok) {
      setVideoMessage({ tone: 'danger', text: picked.error });
      return;
    }
    setVideoMessage(null);
    uploads.addVideo(picked.file, { locationId, source: 'gallery', durationMs: picked.durationMs });
  };

  const addPhoto = (file: File, source: QueueItem['source']) => {
    // Carry room / wall to the next shot so continuous shooting at one wall needs no retyping.
    const last = [...items].reverse().find((item) => item.details.room || item.details.wall);
    uploads.add(file, {
      locationId,
      source,
      details: { room: last?.details.room ?? '', wall: last?.details.wall ?? '' },
    });
  };

  const onRetake = (item: QueueItem) => {
    const source = item.source;
    const wasVideo = Boolean(uploads.videos[item.clientId]);
    uploads.discard(item.clientId);
    if (wasVideo) {
      if (source === 'camera') setVideoOpen(true);
      else nativeVideoPick.current?.click();
      return;
    }
    if (source === 'camera') setCameraOpen(true);
    else if (source === 'gallery') nativePick.current?.click();
  };

  /** Choosing the location after shooting also fills photos still waiting without a location. */
  const changeLocation = (next: string | null) => {
    onLocationChange(next);
    if (!next) return;
    for (const item of items) {
      if (item.status === 'pending_approval' && !item.locationId) uploads.edit(item.clientId, { locationId: next });
    }
  };

  if (!canDocument) {
    return <Alert tone="info">{INFRA_TEXT.noLocationsManage}</Alert>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="infra-capture-panel">
      <InfraLocationSelect
        locations={locations}
        value={locationId}
        onChange={changeLocation}
        label={INFRA_TEXT.capture.location}
        placeholder={INFRA_TEXT.capture.locationPlaceholder}
        required
        testId="infra-capture-location"
      />
      {taskTitle ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {INFRA_TEXT.task}: <span className="font-medium text-[var(--pf-text-primary)]">{taskTitle}</span>
        </p>
      ) : null}
      {!locationId ? <p className="text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.capture.locationRequired}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setCameraOpen((open) => !open)} aria-pressed={cameraOpen} data-testid="infra-open-camera">
          <Camera aria-hidden />
          {INFRA_TEXT.capture.camera}
        </Button>
        <Button type="button" variant="secondary" onClick={() => nativeCapture.current?.click()}>
          <Camera aria-hidden />
          {INFRA_TEXT.capture.takePhoto}
        </Button>
        <Button type="button" variant="secondary" onClick={() => nativePick.current?.click()}>
          <ImageUp aria-hidden />
          {INFRA_TEXT.capture.fromPhone}
        </Button>
        {storagePicker?.((file) => addPhoto(file, 'storage'))}
        {canCaptureVideo ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={!locationId}
              onClick={() => {
                setCameraOpen(false);
                setVideoOpen((open) => !open);
              }}
              aria-pressed={videoOpen}
              data-testid="infra-open-video"
            >
              <Video aria-hidden />
              {INFRA_TEXT.video.record}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!locationId}
              onClick={() => nativeVideoPick.current?.click()}
              data-testid="infra-pick-video"
            >
              <ImageUp aria-hidden />
              {INFRA_TEXT.video.fromPhone}
            </Button>
            <input
              ref={nativeVideoPick}
              type="file"
              accept="video/*"
              className="sr-only"
              data-testid="infra-native-video-pick"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                event.target.value = '';
                for (const file of picked) void addPickedVideo(file);
              }}
            />
          </>
        ) : null}
        <input
          ref={nativeCapture}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          data-testid="infra-native-capture"
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? [])) addPhoto(file, 'camera');
            event.target.value = '';
          }}
        />
        <input
          ref={nativePick}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          data-testid="infra-native-pick"
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? [])) addPhoto(file, 'gallery');
            event.target.value = '';
          }}
        />
      </div>

      {cameraOpen ? <InfraCamera onCapture={(file) => addPhoto(file, 'camera')} onClose={() => setCameraOpen(false)} /> : null}
      {canCaptureVideo && videoOpen ? (
        <InfraVideoRecorder onRecorded={addRecordedVideo} onClose={() => setVideoOpen(false)} />
      ) : null}
      {videoMessage ? (
        <Alert tone={videoMessage.tone} data-testid="infra-video-message">
          {videoMessage.text}
        </Alert>
      ) : null}

      {uploads.unsaved ? <Alert tone="warning">{INFRA_TEXT.capture.unsaved}</Alert> : null}

      {items.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-2" aria-label={INFRA_TEXT.capture.queueTitle}>
          <h3 className="text-sm font-semibold">{INFRA_TEXT.capture.queueTitle}</h3>
          <p className="text-xs text-[var(--pf-text-secondary)]">{INFRA_TEXT.capture.continueHint}</p>
          <ul className="flex min-w-0 flex-col gap-2">
            {items.map((item) => (
              <QueueCard
                key={item.clientId}
                item={item}
                uploads={uploads}
                locations={locations}
                suggestions={suggestions}
                onRetake={onRetake}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
