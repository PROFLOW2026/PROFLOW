'use client';

import { Play, ScanSearch, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatVideoDuration } from '../domain/video';
import type { LocateSlot } from './infra-capture-dialog';
import { extractVideoFrame } from './infra-video-frame';
import { INFRA_TEXT } from './texts';

/**
 * Gallery tile for a video: the first frame (loaded only once the tile is near the screen, so a
 * gallery full of videos does not fetch them all), a play icon and the duration.
 */
export function InfraVideoThumb({
  src,
  durationMs,
  label,
}: {
  readonly src: string;
  readonly durationMs: number | null;
  readonly label: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const element = holder.current;
    if (!element || near) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no observer support: load right away
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  return (
    <div ref={holder} className="relative size-full bg-black" data-testid="infra-video-thumb">
      {near && !broken ? (
        <video
          src={`${src}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          aria-label={label}
          className="pointer-events-none size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white">
          {broken || !near ? <Video className="size-5" /> : <Play className="size-5 fill-white" />}
        </span>
      </span>
      <span className="absolute start-1 top-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
        <Video className="size-3" aria-hidden />
        {INFRA_TEXT.video.badge}
      </span>
      {durationMs ? (
        <span className="absolute end-1 bottom-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
          {formatVideoDuration(durationMs)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Plays an infra video (range-capable same-origin route, so it can seek) and offers the pause ->
 * "use a frame for locating" hand-off into the existing live / two-photo flows.
 */
export function InfraVideoPlayer({
  src,
  onUseFrame,
  canLocate,
}: {
  readonly src: string;
  readonly onUseFrame: (frame: File, slot: LocateSlot) => void;
  readonly canLocate: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState<{ file: File; url: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (frame) URL.revokeObjectURL(frame.url);
    };
  }, [frame]);

  async function takeFrame() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setMessage(null);
    const file = await extractVideoFrame(video);
    if (!file) {
      setMessage(INFRA_TEXT.video.frameFailed);
      return;
    }
    setFrame({ file, url: URL.createObjectURL(file) });
  }

  if (failed) return <Alert tone="warning">{INFRA_TEXT.video.playerFailed}</Alert>;

  return (
    <div className="flex flex-col gap-2" data-testid="infra-video-player">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-[50dvh] w-full rounded-md bg-black object-contain"
        onError={() => setFailed(true)}
        data-testid="infra-video-element"
      />
      {canLocate ? (
        frame ? (
          <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-2" data-testid="infra-video-frame-choice">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.url} alt="" className="h-24 w-32 rounded-md border border-[var(--pf-border-default)] object-cover" />
              <p className="text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.video.useFrameHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => onUseFrame(frame.file, 'live')} data-testid="infra-frame-live">
                {INFRA_TEXT.video.frameLive}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onUseFrame(frame.file, 'before')} data-testid="infra-frame-before">
                {INFRA_TEXT.video.frameBefore}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onUseFrame(frame.file, 'after')} data-testid="infra-frame-after">
                {INFRA_TEXT.video.frameAfter}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFrame(null)}>
                {INFRA_TEXT.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" className="w-fit" onClick={() => void takeFrame()} data-testid="infra-use-frame">
            <ScanSearch aria-hidden />
            {INFRA_TEXT.video.useFrame}
          </Button>
        )
      ) : null}
      {message ? <Alert tone="warning">{message}</Alert> : null}
    </div>
  );
}
