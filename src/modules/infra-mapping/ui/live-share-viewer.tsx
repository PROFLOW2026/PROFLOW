'use client';

/**
 * The watching phone: shows the broadcast picture (camera + infrastructure overlay, already composed
 * by the broadcaster). Subscribe-only, no audio, nothing recorded or stored. No account is needed: joining is a
 * single call to the public join route (signed short-lived link, one viewer only, only while the broadcaster is live).
 * This screen touches nothing else of the app.
 */

import { Loader2, X } from 'lucide-react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { LiveShareResult, LiveShareViewerSession } from '../domain/live-share';
import { LIVE_SHARE_TEXT } from './live-share-texts';

type Status = 'connecting' | 'waiting' | 'watching' | 'ended' | 'left' | 'error';

const subscribeNoop = () => () => undefined;

const VIEWER_KEY_STORAGE = 'pf-live-viewer-key';

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

export function LiveShareViewer({ viewerToken }: { readonly viewerToken: string }) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const leaving = useRef(false);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);

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

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-black text-white"
      style={{ height: '100dvh', width: '100vw' }}
      dir="rtl"
      role="dialog"
      aria-label={LIVE_SHARE_TEXT.viewerTitle}
      data-testid="live-share-viewer"
      data-status={status}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 size-full object-contain ${status === 'watching' ? '' : 'invisible'}`}
        data-testid="live-share-video"
      />
      {message ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/85"
          role="status"
        >
          {status === 'connecting' || status === 'waiting' ? <Loader2 className="size-6 animate-spin" aria-hidden /> : null}
          <span>{message}</span>
        </div>
      ) : null}
      {status === 'watching' || status === 'waiting' || status === 'connecting' ? (
        <button
          type="button"
          onClick={leave}
          className="absolute end-2 top-[max(0.5rem,env(safe-area-inset-top))] inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-2 text-xs text-white backdrop-blur hover:bg-black/80"
          data-testid="live-share-leave"
        >
          <X className="size-4" aria-hidden />
          {LIVE_SHARE_TEXT.viewerLeave}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
