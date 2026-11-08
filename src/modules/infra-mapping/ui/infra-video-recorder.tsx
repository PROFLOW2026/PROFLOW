'use client';

import { Circle, Square, Video, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  INFRA_VIDEO_BITS_PER_SECOND,
  INFRA_VIDEO_FRAME_RATE,
  INFRA_VIDEO_HEIGHT,
  INFRA_VIDEO_MAX_MS,
  INFRA_VIDEO_WIDTH,
  clampVideoDurationMs,
  formatVideoDuration,
  normalizeVideoMime,
  pickRecorderMimeType,
  videoExtension,
} from '../domain/video';
import { INFRA_TEXT } from './texts';

type Phase = 'starting' | 'ready' | 'recording' | 'error';

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return INFRA_TEXT.video.permissionDenied;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return INFRA_TEXT.video.noCamera;
  }
  return INFRA_TEXT.video.failed;
}

/**
 * In-page short-video recorder: rear camera, ~720p, ~1.25 Mbps, NO audio, container chosen from what
 * the browser can actually record (MP4 first, then WebM). No minimum length; stops on request and
 * automatically at 30 s. The result goes to `onRecorded` for preview / approval - nothing is uploaded
 * from here.
 */
export function InfraVideoRecorder({
  onRecorded,
  onClose,
}: {
  readonly onRecorded: (file: File, durationMs: number, autoStopped: boolean) => void;
  readonly onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timersRef = useRef<{ tick: number | null; limit: number | null }>({ tick: null, limit: null });
  const autoStoppedRef = useRef(false);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  });

  const clearTimers = useCallback(() => {
    const { tick, limit } = timersRef.current;
    if (tick !== null) window.clearInterval(tick);
    if (limit !== null) window.clearTimeout(limit);
    timersRef.current = { tick: null, limit: null };
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof MediaRecorder === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        !pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type))
      ) {
        setError(INFRA_TEXT.video.unsupported);
        setPhase('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: INFRA_VIDEO_WIDTH },
            height: { ideal: INFRA_VIDEO_HEIGHT },
            frameRate: { ideal: INFRA_VIDEO_FRAME_RATE, max: INFRA_VIDEO_FRAME_RATE },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setPhase('ready');
      } catch (cause) {
        if (cancelled) return;
        setError(cameraErrorMessage(cause));
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        doneRef.current = true; // closed while recording: drop the clip, never hand it over
        try {
          recorder.stop();
        } catch {
          // already stopped
        }
      }
      releaseStream();
    };
  }, [clearTimers, releaseStream]);

  const finish = useCallback(
    (mimeType: string) => {
      clearTimers();
      if (doneRef.current) return;
      doneRef.current = true;
      // No minimum length: even an immediate stop yields a (1 ms+) clip as long as it has frames.
      const durationMs = Math.max(1, clampVideoDurationMs(performance.now() - startedAtRef.current));
      const blob = new Blob(chunksRef.current, { type: normalizeVideoMime(mimeType) ?? 'video/webm' });
      chunksRef.current = [];
      releaseStream();
      if (blob.size === 0) {
        setError(INFRA_TEXT.video.empty);
        setPhase('error');
        return;
      }
      const type = blob.type;
      const file = new File([blob], `video-${Date.now()}.${videoExtension(type)}`, { type });
      onRecordedRef.current(file, durationMs, autoStoppedRef.current);
    },
    [clearTimers, releaseStream],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, []);

  function start() {
    const stream = streamRef.current;
    if (!stream || phase !== 'ready') return;
    const mimeType = pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setError(INFRA_TEXT.video.unsupported);
      setPhase('error');
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: INFRA_VIDEO_BITS_PER_SECOND });
      chunksRef.current = [];
      doneRef.current = false;
      autoStoppedRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => finish(recorder.mimeType || mimeType);
      recorder.onerror = () => {
        clearTimers();
        doneRef.current = true;
        releaseStream();
        setError(INFRA_TEXT.video.failed);
        setPhase('error');
      };
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      recorder.start(1000);
      setElapsedMs(0);
      setPhase('recording');
      timersRef.current.tick = window.setInterval(() => {
        const elapsed = performance.now() - startedAtRef.current;
        setElapsedMs(Math.min(elapsed, INFRA_VIDEO_MAX_MS));
        if (elapsed >= INFRA_VIDEO_MAX_MS) {
          autoStoppedRef.current = true;
          stop();
        }
      }, 200);
      // Backstop for the 30 s limit if timers are throttled (background tab).
      timersRef.current.limit = window.setTimeout(() => {
        autoStoppedRef.current = true;
        stop();
      }, INFRA_VIDEO_MAX_MS);
    } catch {
      setError(INFRA_TEXT.video.failed);
      setPhase('error');
    }
  }

  if (phase === 'error') {
    return (
      <div data-pf-style="classic" className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3 text-sm" role="alert" data-testid="infra-video-error">
        <p>{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose} className="w-fit">
          {INFRA_TEXT.close}
        </Button>
      </div>
    );
  }

  const recording = phase === 'recording';
  return (
    <div data-pf-style="classic" className="relative overflow-hidden rounded-lg bg-(--pf-lit-black)" data-testid="infra-video-recorder" data-phase={phase}>
      <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] max-h-[60dvh] w-full object-cover" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-(--pf-lit-black)/70 to-transparent p-3 text-sm text-(--pf-lit-white)">
        <span data-testid="infra-video-timer" className="tabular-nums">
          {recording ? (
            <>
              <Circle className="me-1 inline size-3 animate-pulse fill-red-500 text-(--pf-lit-red-500)" aria-hidden />
              {INFRA_TEXT.video.recording} {formatVideoDuration(elapsedMs)} / 0:30
            </>
          ) : phase === 'starting' ? (
            INFRA_TEXT.video.starting
          ) : (
            INFRA_TEXT.video.limit
          )}
        </span>
        <span className="rounded-full bg-(--pf-lit-black)/50 px-2 py-0.5 text-xs">{INFRA_TEXT.video.noAudio}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-(--pf-lit-black)/70 to-transparent p-3">
        {recording ? (
          <Button type="button" size="lg" variant="danger" onClick={stop} data-testid="infra-video-stop">
            <Square aria-hidden />
            {INFRA_TEXT.video.stop}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={start} disabled={phase !== 'ready'} data-testid="infra-video-start">
            <Video aria-hidden />
            {INFRA_TEXT.video.start}
          </Button>
        )}
        {!recording ? (
          <Button type="button" variant="secondary" size="lg" onClick={onClose} aria-label={INFRA_TEXT.video.stopCamera}>
            <X aria-hidden />
            {INFRA_TEXT.video.stopCamera}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
