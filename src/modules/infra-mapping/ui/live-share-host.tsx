'use client';

/**
 * The broadcasting phone (live camera mode): "שתף שידור".
 *
 * The picture sent is the COMPOSED picture - the camera frame with the transparent "before" layer drawn
 * on top - painted onto an off-screen canvas and published to LiveKit as one video-only track. No audio,
 * no recording, nothing stored. LiveKit keys never reach the browser: the server hands this component
 * a short-lived publish-only token and a signed share token (carried by the QR / link).
 */

import { Cast, Copy, Loader2, X } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useLocale } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InfraLiveShareSource } from '@/modules/project-workspace/ui/infra-trial-integration';
import { endLiveShareAction, startLiveShareAction } from '../actions';
import type { InfraViewer } from '../domain/types';
import { LIVE_SHARE_TEXT } from './live-share-texts';

/** Longest side of the broadcast picture, and its frame rate: enough to read the overlay, light on a phone. */
const MAX_SIDE = 1280;
const FPS = 24;
const MAX_BITRATE = 1_800_000;

const barButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 active:bg-white/25 disabled:opacity-40';

interface Session {
  readonly room: Room;
  readonly track: MediaStreamTrack;
  readonly shareToken: string;
  frame: number;
}

function loadImage(url: string): HTMLImageElement {
  const img = new Image();
  img.src = url;
  return img;
}

export function LiveShareHost({
  viewer,
  projectId,
  organizationId,
  source,
}: {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  readonly organizationId: string;
  readonly source: InfraLiveShareSource;
}) {
  const locale = useLocale();
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live'>('idle');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewerJoined, setViewerJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const session = useRef<Session | null>(null);
  const mounted = useRef(false);

  /** Stops painting / publishing and leaves the room. Returns the share token so the server room can be closed. */
  const teardown = useCallback((): string | null => {
    const current = session.current;
    session.current = null;
    if (!current) return null;
    cancelAnimationFrame(current.frame);
    current.track.stop();
    void current.room.disconnect();
    return current.shareToken;
  }, []);

  const finish = useCallback(() => {
    const token = teardown();
    if (token) void endLiveShareAction(viewer, { shareToken: token });
  }, [teardown, viewer]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      finish();
    };
  }, [finish]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  async function start() {
    if (session.current || phase === 'starting') return;
    setError(null);
    setPhase('starting');
    try {
      const first = source.getComposition();
      if (!first || !first.video.videoWidth) {
        setError(LIVE_SHARE_TEXT.cameraNotReady);
        setPhase('idle');
        return;
      }

      const response = await startLiveShareAction(viewer, { projectId, organizationId });
      if (!response.ok) {
        setError(response.error);
        setPhase('idle');
        return;
      }
      const { url, token, shareToken, viewerToken } = response.data;

      // Paint the composed picture (camera + overlay) on a canvas and stream the canvas.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      let overlayUrl: string | null = null;
      let overlayImage: HTMLImageElement | null = null;
      const paint = () => {
        const c = source.getComposition();
        if (!c || !c.video.videoWidth || c.stageW <= 0 || c.stageH <= 0) return;
        const k = Math.min(1, MAX_SIDE / Math.max(c.stageW, c.stageH));
        const w = Math.max(2, Math.round(c.stageW * k));
        const h = Math.max(2, Math.round(c.stageH * k));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.setTransform(k, 0, 0, k, 0, 0);
        // The camera, cropped exactly like the on-screen `object-cover` video.
        const cover = Math.max(c.stageW / c.video.videoWidth, c.stageH / c.video.videoHeight);
        const dw = c.video.videoWidth * cover;
        const dh = c.video.videoHeight * cover;
        ctx.drawImage(c.video, (c.stageW - dw) / 2, (c.stageH - dh) / 2, dw, dh);
        // The transparent "before" layer, through the same alignment as on screen.
        if (c.overlay && c.matrix) {
          if (overlayUrl !== c.overlay.url) {
            overlayUrl = c.overlay.url;
            overlayImage = loadImage(c.overlay.url);
          }
          if (overlayImage?.complete && overlayImage.naturalWidth > 0) {
            const m = c.matrix;
            ctx.save();
            ctx.globalAlpha = c.opacity;
            ctx.setTransform(m[0]! * k, m[3]! * k, m[1]! * k, m[4]! * k, m[2]! * k, m[5]! * k);
            ctx.drawImage(overlayImage, 0, 0, c.overlay.width, c.overlay.height);
            ctx.restore();
          }
        }
      };
      paint();

      const track = canvas.captureStream(FPS).getVideoTracks()[0];
      if (!track) throw new Error('track');
      const room = new Room();
      const started: Session = { room, track, shareToken, frame: 0 };
      session.current = started;

      room.on(RoomEvent.ParticipantConnected, () => setViewerJoined(true));
      room.on(RoomEvent.ParticipantDisconnected, () => setViewerJoined(room.remoteParticipants.size > 0));
      room.on(RoomEvent.Disconnected, () => {
        if (session.current?.room !== room) return; // we ended it ourselves
        const lostToken = teardown();
        if (lostToken) void endLiveShareAction(viewer, { shareToken: lostToken });
        if (mounted.current) {
          setPhase('idle');
          setSheetOpen(false);
          setViewerJoined(false);
          setError(LIVE_SHARE_TEXT.connectionLost);
        }
      });

      await room.connect(url, token);
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        name: 'live',
        simulcast: false,
        videoEncoding: { maxBitrate: MAX_BITRATE, maxFramerate: FPS },
      });
      if (!mounted.current || session.current !== started) return; // closed while connecting

      let last = 0;
      const loop = (now: number) => {
        if (session.current !== started) return;
        if (now - last >= 1000 / FPS - 2) {
          last = now;
          paint();
        }
        started.frame = requestAnimationFrame(loop);
      };
      started.frame = requestAnimationFrame(loop);

      const shareLink = `${window.location.origin}/${locale}/live/${viewerToken}`;
      setLink(shareLink);
      setViewerJoined(room.remoteParticipants.size > 0);
      setCopied(false);
      setPhase('live');
      setSheetOpen(true);
      void import('qrcode')
        .then((qrcode) => qrcode.toDataURL(shareLink, { margin: 1, width: 280, errorCorrectionLevel: 'M' }))
        .then((dataUrl) => {
          if (mounted.current && session.current === started) setQr(dataUrl);
        })
        .catch(() => undefined);
    } catch {
      const token = teardown();
      if (token) void endLiveShareAction(viewer, { shareToken: token });
      if (mounted.current) {
        setError(LIVE_SHARE_TEXT.connectionLost);
        setPhase('idle');
      }
    }
  }

  function end() {
    finish();
    setPhase('idle');
    setSheetOpen(false);
    setViewerJoined(false);
    setLink(null);
    setQr(null);
  }

  function onButton() {
    if (phase === 'live') setSheetOpen(true);
    else void start();
  }

  function copyLink() {
    if (!link) return;
    void navigator.clipboard
      ?.writeText(link)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  // Rendered in the body: the control bar has a backdrop filter, which would trap a fixed child.
  const errorNotice =
    error && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[1050] mx-auto w-fit max-w-full rounded bg-black/80 px-2 py-1 text-center text-[11px] text-white"
            dir="rtl"
            role="alert"
            data-testid="live-share-error"
          >
            {error}
          </div>,
          document.body,
        )
      : null;

  const sheet =
    phase === 'live' && sheetOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/60 p-3 sm:items-center"
            role="dialog"
            aria-label={LIVE_SHARE_TEXT.title}
            dir="rtl"
            data-testid="live-share-sheet"
          >
            <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-neutral-900 p-4 text-white shadow-xl">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-base font-semibold">{LIVE_SHARE_TEXT.title}</h2>
                <button type="button" className={barButtonClass} onClick={() => setSheetOpen(false)} aria-label={LIVE_SHARE_TEXT.hide}>
                  <X className="size-5" />
                </button>
              </div>
              <p className="text-xs leading-5 text-white/75">{LIVE_SHARE_TEXT.hint}</p>
              <div className="flex justify-center rounded-lg bg-white p-2">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={LIVE_SHARE_TEXT.qrAlt} className="size-56" data-testid="live-share-qr" />
                ) : (
                  <Loader2 className="size-56 animate-spin p-20 text-neutral-400" aria-hidden />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link ?? ''}
                  dir="ltr"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md bg-neutral-800 px-2 py-1.5 text-xs text-white"
                  data-testid="live-share-link"
                />
                <button type="button" className={barButtonClass} onClick={copyLink} aria-label={LIVE_SHARE_TEXT.copyLink}>
                  <Copy className="size-4" />
                </button>
              </div>
              <p className="text-center text-xs text-white/80" role="status">
                {copied ? LIVE_SHARE_TEXT.copied : viewerJoined ? LIVE_SHARE_TEXT.viewerJoined : LIVE_SHARE_TEXT.waitingViewer}
              </p>
              <button
                type="button"
                onClick={end}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                data-testid="live-share-end"
              >
                {LIVE_SHARE_TEXT.end}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={`${barButtonClass} ${phase === 'live' ? 'bg-red-600/90' : ''}`}
        onClick={onButton}
        disabled={phase === 'starting'}
        aria-label={LIVE_SHARE_TEXT.share}
        title={phase === 'live' ? LIVE_SHARE_TEXT.liveBadge : LIVE_SHARE_TEXT.share}
        data-testid="live-share-button"
      >
        {phase === 'starting' ? <Loader2 className="size-5 animate-spin" /> : <Cast className="size-5" />}
      </button>
      {errorNotice}
      {sheet}
    </>
  );
}
