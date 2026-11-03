'use client';

/**
 * The watching phone: shows the broadcast picture (camera + infrastructure overlay, already composed
 * by the broadcaster). Subscribe-only, no audio, nothing recorded or stored. Joining is checked on the
 * server (signed link + signed-in member of the project + one viewer only).
 */

import { Loader2, X } from 'lucide-react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { joinLiveShareAction } from '../actions';
import { LIVE_SHARE_TEXT } from './live-share-texts';

type Status = 'connecting' | 'waiting' | 'watching' | 'ended' | 'left' | 'error';

const subscribeNoop = () => () => undefined;

export function LiveShareViewer({ shareToken }: { readonly shareToken: string }) {
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
      const joined = await joinLiveShareAction({ shareToken });
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
  }, [shareToken]);

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
