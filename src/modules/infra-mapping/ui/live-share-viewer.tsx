'use client';

/**
 * The watching phone: shows the broadcast picture (camera + infrastructure overlay, already composed
 * by the broadcaster). Subscribe-only, no audio, nothing recorded or stored. No account is needed: joining is a
 * single call to the public join route (signed short-lived link, one viewer only, only while the broadcaster is live).
 * This screen touches nothing else of the app.
 *
 * Zoom, pan and full view happen only here, on this phone: the broadcast itself is never changed.
 */

import { Loader2, Maximize2, Minimize2, X } from 'lucide-react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { LiveShareResult, LiveShareViewerSession } from '../domain/live-share';
import { LIVE_SHARE_TEXT } from './live-share-texts';
import {
  DOUBLE_TAP_SCALE,
  IDENTITY_VIEW,
  panView,
  zoomView,
  type ViewTransform,
} from './live-share-view';

type Status = 'connecting' | 'waiting' | 'watching' | 'ended' | 'left' | 'error';

const subscribeNoop = () => () => undefined;

const VIEWER_KEY_STORAGE = 'pf-live-viewer-key';
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 10;
/** How long the connection chip stays readable after a change before it shrinks to a dot. */
const CHIP_VISIBLE_MS = 3500;

/** A random id this browser keeps, so a refresh replaces its own connection instead of counting as a second viewer. */
function viewerKey(): string {
  const fresh = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  try {
    const stored = sessionStorage.getItem(VIEWER_KEY_STORAGE);
    if (stored && /^[a-f0-9]{32}$/.test(stored)) return stored;
    const created = fresh();
    sessionStorage.setItem(VIEWER_KEY_STORAGE, created);
    return created;
  } catch {
    return fresh();
  }
}

async function join(viewerToken: string): Promise<LiveShareResult<LiveShareViewerSession>> {
  try {
    const response = await fetch('/api/live-share/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerToken, viewerKey: viewerKey() }),
      cache: 'no-store',
      credentials: 'omit',
    });
    return (await response.json()) as LiveShareResult<LiveShareViewerSession>;
  } catch {
    return { ok: false, error: LIVE_SHARE_TEXT.connectionLost };
  }
}

type LinkState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const LINK_VIEW: Record<LinkState, { text: string; dot: string }> = {
  connecting: { text: LIVE_SHARE_TEXT.viewerConnecting, dot: 'bg-amber-400' },
  connected: { text: LIVE_SHARE_TEXT.viewerConnected, dot: 'bg-emerald-400' },
  reconnecting: { text: LIVE_SHARE_TEXT.viewerReconnecting, dot: 'bg-amber-400' },
  disconnected: { text: LIVE_SHARE_TEXT.viewerDisconnected, dot: 'bg-red-500' },
};

const iconButtonClass =
  'inline-flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80';

export function LiveShareViewer({ viewerToken }: { readonly viewerToken: string }) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const leaving = useRef(false);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [chipOpen, setChipOpen] = useState(true);
  const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW);
  const viewRef = useRef<ViewTransform>(IDENTITY_VIEW);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const writeView = useCallback((next: ViewTransform) => {
    viewRef.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    leaving.current = false;
    const room = new Room();
    roomRef.current = room;

    const attach = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Video || !videoRef.current) return;
      track.attach(videoRef.current);
      setStatus('watching');
    };
    room.on(RoomEvent.TrackSubscribed, attach);
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        track.detach();
        setStatus('ended');
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, () => setStatus('ended'));
    room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
    room.on(RoomEvent.Reconnected, () => setReconnecting(false));
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled && !leaving.current) setStatus('ended');
    });

    (async () => {
      const joined = await join(viewerToken);
      if (cancelled) return;
      if (!joined.ok) {
        setError(joined.error);
        setStatus('error');
        return;
      }
      try {
        await room.connect(joined.data.url, joined.data.token);
        if (cancelled) {
          void room.disconnect();
          return;
        }
        setStatus((current) => (current === 'connecting' ? 'waiting' : current));
      } catch {
        if (!cancelled) {
          setError(LIVE_SHARE_TEXT.connectionLost);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      leaving.current = true;
      void room.disconnect();
      roomRef.current = null;
    };
  }, [viewerToken]);

  // Full view (where the browser supports it; not on every phone).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  // Connection chip: readable for a moment after every change, then a small dot.
  const link: LinkState =
    status === 'ended' || status === 'error' || status === 'left'
      ? 'disconnected'
      : reconnecting
        ? 'reconnecting'
        : status === 'connecting'
          ? 'connecting'
          : 'connected';
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the chip again on every change
    setChipOpen(true);
    if (link === 'disconnected') return undefined;
    const timer = window.setTimeout(() => setChipOpen(false), CHIP_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [link]);

  /* Touch zoom / pan (viewer side only) */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef<{ at: number; x: number; y: number; moved: boolean }>({ at: 0, x: 0, y: 0, moved: false });
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  function stageBox() {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 1) tap.current = { at: Date.now(), x: e.clientX, y: e.clientY, moved: false };
    else tap.current.moved = true;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(e.pointerId);
    const box = stageBox();
    if (!previous || !box) return;
    const current = { x: e.clientX, y: e.clientY };
    if (Math.hypot(current.x - tap.current.x, current.y - tap.current.y) > TAP_SLOP_PX) tap.current.moved = true;
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    pointers.current.set(e.pointerId, current);
    if (others.length === 0) {
      writeView(panView(viewRef.current, current.x - previous.x, current.y - previous.y, box.width, box.height));
      return;
    }
    const other = others[0]![1];
    const d0 = Math.hypot(other.x - previous.x, other.y - previous.y);
    const d1 = Math.hypot(other.x - current.x, other.y - current.y);
    if (d0 < 8) return;
    const midPrev = { x: (other.x + previous.x) / 2, y: (other.y + previous.y) / 2 };
    const midNow = { x: (other.x + current.x) / 2, y: (other.y + current.y) / 2 };
    writeView(
      zoomView(
        viewRef.current,
        d1 / d0,
        { x: midPrev.x - box.left - box.width / 2, y: midPrev.y - box.top - box.height / 2 },
        { x: midNow.x - midPrev.x, y: midNow.y - midPrev.y },
        box.width,
        box.height,
      ),
    );
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!wasSingle || tap.current.moved || e.type === 'pointercancel') return;
    const now = Date.now();
    const previousTap = lastTap.current;
    if (
      previousTap &&
      now - previousTap.at < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - previousTap.x, e.clientY - previousTap.y) < 40
    ) {
      lastTap.current = null;
      const box = stageBox();
      if (!box) return;
      if (viewRef.current.scale > 1.01) writeView(IDENTITY_VIEW);
      else {
        writeView(
          zoomView(
            viewRef.current,
            DOUBLE_TAP_SCALE,
            { x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 },
            { x: 0, y: 0 },
            box.width,
            box.height,
          ),
        );
      }
      return;
    }
    lastTap.current = { at: now, x: e.clientX, y: e.clientY };
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    const box = stageBox();
    if (!box) return;
    writeView(
      zoomView(
        viewRef.current,
        Math.exp(-e.deltaY * 0.002),
        { x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 },
        { x: 0, y: 0 },
        box.width,
        box.height,
      ),
    );
  }

  function leave() {
    leaving.current = true;
    void roomRef.current?.disconnect();
    setStatus('left');
  }

  if (!mounted) return null;

  const message =
    status === 'connecting'
      ? LIVE_SHARE_TEXT.viewerConnecting
      : status === 'waiting'
        ? LIVE_SHARE_TEXT.viewerWaitingHost
        : status === 'ended'
          ? LIVE_SHARE_TEXT.viewerEnded
          : status === 'left'
            ? LIVE_SHARE_TEXT.viewerLeft
            : status === 'error'
              ? error
              : null;

  const zoomed = view.scale > 1.01;
  const linkView = LINK_VIEW[link];

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-black text-white"
      style={{ height: '100dvh', width: '100vw' }}
      dir="rtl"
      role="dialog"
      aria-label={LIVE_SHARE_TEXT.viewerTitle}
      data-testid="live-share-viewer"
      data-status={status}
      data-link={link}
    >
      <div
        ref={stageRef}
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
        data-testid="live-share-stage"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`pointer-events-none absolute inset-0 size-full object-contain ${status === 'watching' ? '' : 'invisible'}`}
          style={{
            transformOrigin: 'center',
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            willChange: 'transform',
          }}
          data-testid="live-share-video"
          data-zoom={view.scale.toFixed(2)}
        />
      </div>
      {message ? (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/85"
          role="status"
        >
          {status === 'connecting' || status === 'waiting' ? <Loader2 className="size-6 animate-spin" aria-hidden /> : null}
          <span>{message}</span>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute start-2 top-[max(0.5rem,env(safe-area-inset-top))]"
        role="status"
        data-testid="live-share-link-chip"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur">
          <span className={`size-2 rounded-full ${linkView.dot}`} aria-hidden />
          {chipOpen ? linkView.text : <span className="sr-only">{linkView.text}</span>}
        </span>
      </div>

      {status === 'watching' || status === 'waiting' || status === 'connecting' ? (
        <div className="absolute end-2 top-[max(0.5rem,env(safe-area-inset-top))] flex items-center gap-1.5">
          {zoomed ? (
            <button
              type="button"
              onClick={() => writeView(IDENTITY_VIEW)}
              className="inline-flex h-9 items-center rounded-full bg-black/60 px-3 text-xs tabular-nums text-white backdrop-blur hover:bg-black/80"
              aria-label={LIVE_SHARE_TEXT.viewerResetZoom}
              data-testid="live-share-reset-zoom"
              dir="ltr"
            >
              {view.scale.toFixed(2)}×
            </button>
          ) : null}
          {canFullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              className={iconButtonClass}
              aria-label={fullscreen ? LIVE_SHARE_TEXT.viewerExitFullscreen : LIVE_SHARE_TEXT.viewerFullscreen}
              data-testid="live-share-fullscreen"
            >
              {fullscreen ? <Minimize2 className="size-5" aria-hidden /> : <Maximize2 className="size-5" aria-hidden />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={leave}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-black/60 px-3 text-xs text-white backdrop-blur hover:bg-black/80"
            data-testid="live-share-leave"
          >
            <X className="size-4" aria-hidden />
            {LIVE_SHARE_TEXT.viewerLeave}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}