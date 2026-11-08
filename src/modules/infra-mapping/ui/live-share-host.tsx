'use client';

/**
 * The broadcasting phone (live camera mode): "שתף שידור".
 *
 * The picture sent is the COMPOSED picture - the camera frame with the transparent "before" layer drawn
 * on top - painted onto an off-screen canvas and published to LiveKit as one video-only track. No audio,
 * no recording, nothing stored. LiveKit keys never reach the browser: the server hands this component
 * a short-lived publish-only token and a signed share token (carried by the QR / link).
 */

import { Cast, Copy, Hand, Loader2, X } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useLocale } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarButton, OVERLAY_TEXT } from '@/modules/project-workspace/ui/infra-overlay-controls';
import { paintComposition } from '@/modules/project-workspace/ui/infra-overlay-render';
import type { InfraLiveShareSource } from '@/modules/project-workspace/ui/infra-trial-integration';
import { endLiveShareAction, setLiveShareControlAction, startLiveShareAction } from '../actions';
import { LIVE_CONTROL } from '../domain/live-control';
import type { InfraViewer } from '../domain/types';
import { RemoteHostController } from './live-remote-host';
import { buildReferenceDataUrl } from './live-remote-reference';
import { LIVE_SHARE_TEXT, liveBadgeExtras, liveBadgeText } from './live-share-texts';
import { useWakeLock } from './use-wake-lock';

/** Longest side of the broadcast picture, and its frame rate: enough to read the overlay, light on a phone. */
const MAX_SIDE = 1280;
const FPS = 24;
const MAX_BITRATE = 1_800_000;

const barButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--pf-lit-white) transition-colors hover:bg-(--pf-lit-white)/15 active:bg-(--pf-lit-white)/25 disabled:opacity-40';

interface Session {
  readonly room: Room;
  readonly track: MediaStreamTrack;
  readonly shareToken: string;
  /** Created once the room is joined (its name is the session id every control packet carries). */
  controller: RemoteHostController | null;
  frame: number;
}

/** A labelled on / off switch row of the share sheet. */
function SwitchRow({
  label,
  hint,
  checked,
  busy,
  onChange,
  testId,
}: {
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
  readonly busy?: boolean;
  readonly onChange: (next: boolean) => void;
  readonly testId: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-(--pf-lit-neutral-800)/80 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-(--pf-lit-white)/70">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          checked ? 'bg-cyan-500' : 'bg-(--pf-lit-neutral-600)'
        }`}
        data-testid={testId}
      >
        {busy ? (
          <Loader2 className="mx-auto size-4 animate-spin text-(--pf-lit-white)" aria-hidden />
        ) : (
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-(--pf-lit-white) shadow transition-all ${checked ? 'left-[1.5rem]' : 'left-0.5'}`}
            aria-hidden
          />
        )}
        <span className="sr-only">{checked ? LIVE_SHARE_TEXT.switchOn : LIVE_SHARE_TEXT.switchOff}</span>
      </button>
    </div>
  );
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
  /** A viewer was connected and then dropped (shown in the small status chip). */
  const [viewerLeft, setViewerLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** The broadcaster approved remote marking for this session (the second phone may place points). */
  const [controlOn, setControlOn] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [tripod, setTripod] = useState(false);
  const wakeLock = useWakeLock(phase === 'live' && tripod);
  const session = useRef<Session | null>(null);
  const mounted = useRef(false);

  /** Stops painting / publishing and leaves the room. Returns the share token so the server room can be closed. */
  const teardown = useCallback((): string | null => {
    const current = session.current;
    session.current = null;
    if (!current) return null;
    current.controller?.dispose();
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
        if (c.overlay && overlayUrl !== c.overlay.url) {
          overlayUrl = c.overlay.url;
          overlayImage = loadImage(c.overlay.url);
        }
        const ready = c.overlay && overlayImage?.complete && overlayImage.naturalWidth > 0 ? overlayImage : null;
        // The very same drawing as the saved picture: the camera cropped like the on-screen video, then the
        // transparent layer through the same alignment matrix (perspective included) the screen uses.
        paintComposition(ctx, c, ready);
      };
      paint();

      const track = canvas.captureStream(FPS).getVideoTracks()[0];
      if (!track) throw new Error('track');
      const room = new Room();
      const started: Session = { room, track, shareToken, controller: null, frame: 0 };
      session.current = started;

      room.on(RoomEvent.ParticipantConnected, () => {
        setViewerJoined(true);
        setViewerLeft(false);
        started.controller?.setViewerPresent(true);
        // The viewer is in: close the QR window so the camera and overlay stay clear (it can be reopened).
        setSheetOpen(false);
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        const stillThere = room.remoteParticipants.size > 0;
        setViewerJoined(stillThere);
        if (!stillThere) setViewerLeft(true);
        // The alignment stays exactly as it is: the broadcaster simply carries on on its own.
        started.controller?.setViewerPresent(stillThere);
      });
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== LIVE_CONTROL.topic) return;
        started.controller?.receive(payload, participant?.identity);
      });
      room.on(RoomEvent.Reconnected, () => started.controller?.republish());
      room.on(RoomEvent.Disconnected, () => {
        if (session.current?.room !== room) return; // we ended it ourselves
        const lostToken = teardown();
        if (lostToken) void endLiveShareAction(viewer, { shareToken: lostToken });
        if (mounted.current) {
          setPhase('idle');
          setSheetOpen(false);
          setViewerJoined(false);
          setViewerLeft(false);
          resetRemote();
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

      // The door for the second phone: closed until the broadcaster approves remote marking.
      const controller = new RemoteHostController({
        sessionId: room.name,
        remote: source.remote,
        send: (bytes) => {
          void room.localParticipant.publishData(bytes, { reliable: true, topic: LIVE_CONTROL.topic }).catch(() => undefined);
        },
        loadReference: () => buildReferenceDataUrl(source.remote.getReference()),
        onReleased: () => {
          if (session.current !== started) return;
          setControlOn(false);
          void setLiveShareControlAction(viewer, { shareToken, enabled: false }).catch(() => undefined);
        },
      });
      started.controller = controller;
      controller.start();
      controller.setViewerPresent(room.remoteParticipants.size > 0);

      let last = 0;
      const loop = (now: number) => {
        if (session.current !== started) return;
        if (now - last >= 1000 / FPS - 2) {
          last = now;
          try {
            paint();
          } catch {
            // One bad frame (a camera that is momentarily not drawable) must never end the broadcast.
          }
        }
        started.frame = requestAnimationFrame(loop);
      };
      started.frame = requestAnimationFrame(loop);

      const shareLink = `${window.location.origin}/${locale}/live/${viewerToken}`;
      setLink(shareLink);
      setViewerJoined(room.remoteParticipants.size > 0);
      setCopied(false);
      setPhase('live');
      setSheetOpen(room.remoteParticipants.size === 0);
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

  /** Back to the local-only state: no remote control, no tripod bar. */
  function resetRemote() {
    setControlOn(false);
    setControlBusy(false);
    setTripod(false);
    source.remote.setTripod(false);
  }

  /**
   * Approves / withdraws remote marking. Withdrawing closes the local door first (nothing more is accepted at
   * once) and then removes the server-side permission; approving needs the server grant first.
   */
  async function changeControl(next: boolean): Promise<boolean> {
    const current = session.current;
    if (!current?.controller || controlBusy) return false;
    setControlBusy(true);
    setError(null);
    try {
      if (!next) {
        current.controller.setControl(false);
        setControlOn(false);
      }
      const response = await setLiveShareControlAction(viewer, { shareToken: current.shareToken, enabled: next });
      if (session.current !== current) return false;
      if (!response.ok) {
        setError(LIVE_SHARE_TEXT.controlFailed);
        return false;
      }
      if (next) {
        current.controller.setControl(true);
        setControlOn(true);
      }
      return true;
    } catch {
      if (mounted.current) setError(LIVE_SHARE_TEXT.controlFailed);
      return false;
    } finally {
      if (mounted.current) setControlBusy(false);
    }
  }

  /** Tripod mode: the screen stays awake, the bar shrinks, and the second phone does the marking. */
  async function changeTripod(next: boolean) {
    const current = session.current;
    if (!current?.controller) return;
    setTripod(next);
    current.controller.setTripod(next);
    if (next && !controlOn) await changeControl(true);
  }

  function end() {
    finish();
    resetRemote();
    setPhase('idle');
    setSheetOpen(false);
    setViewerJoined(false);
    setViewerLeft(false);
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
            className="pointer-events-none fixed inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[1050] mx-auto w-fit max-w-full rounded bg-(--pf-lit-black)/80 px-2 py-1 text-center text-[11px] text-(--pf-lit-white)"
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
            className="fixed inset-0 z-[1100] flex items-end justify-center bg-(--pf-lit-black)/60 p-3 sm:items-center"
            role="dialog"
            aria-label={LIVE_SHARE_TEXT.title}
            dir="rtl"
            data-pf-style="classic"
            data-testid="live-share-sheet"
          >
            <div className="flex max-h-[92dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-xl bg-(--pf-lit-neutral-900) p-4 text-(--pf-lit-white) shadow-xl">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-base font-semibold">{LIVE_SHARE_TEXT.title}</h2>
                <button type="button" className={barButtonClass} onClick={() => setSheetOpen(false)} aria-label={LIVE_SHARE_TEXT.hide}>
                  <X className="size-5" />
                </button>
              </div>
              <p className="text-xs leading-5 text-(--pf-lit-white)/75">{LIVE_SHARE_TEXT.hint}</p>
              <div className="flex justify-center rounded-lg bg-(--pf-lit-white) p-2">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={LIVE_SHARE_TEXT.qrAlt} className="size-56" data-testid="live-share-qr" />
                ) : (
                  <Loader2 className="size-56 animate-spin p-20 text-(--pf-lit-neutral-400)" aria-hidden />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link ?? ''}
                  dir="ltr"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md bg-(--pf-lit-neutral-800) px-2 py-1.5 text-xs text-(--pf-lit-white)"
                  data-testid="live-share-link"
                />
                <button type="button" className={barButtonClass} onClick={copyLink} aria-label={LIVE_SHARE_TEXT.copyLink}>
                  <Copy className="size-4" />
                </button>
              </div>
              <p className="text-center text-xs text-(--pf-lit-white)/80" role="status">
                {copied ? LIVE_SHARE_TEXT.copied : viewerJoined ? LIVE_SHARE_TEXT.viewerJoined : LIVE_SHARE_TEXT.waitingViewer}
              </p>
              <SwitchRow
                label={LIVE_SHARE_TEXT.controlSwitch}
                hint={controlBusy ? LIVE_SHARE_TEXT.controlBusy : LIVE_SHARE_TEXT.controlSwitchHint}
                checked={controlOn}
                busy={controlBusy}
                onChange={(next) => void changeControl(next)}
                testId="live-share-control-switch"
              />
              <SwitchRow
                label={LIVE_SHARE_TEXT.tripodSwitch}
                hint={LIVE_SHARE_TEXT.tripodHint}
                checked={tripod}
                onChange={(next) => void changeTripod(next)}
                testId="live-share-tripod-switch"
              />
              {tripod ? (
                <p className="text-center text-[11px] text-(--pf-lit-white)/75" role="status" data-testid="live-share-wake-status">
                  {wakeLock === 'held'
                    ? LIVE_SHARE_TEXT.tripodWakeHeld
                    : wakeLock === 'unsupported'
                      ? LIVE_SHARE_TEXT.tripodWakeUnsupported
                      : wakeLock === 'denied'
                        ? LIVE_SHARE_TEXT.tripodWakeDenied
                        : LIVE_SHARE_TEXT.tripodWakePending}
                </p>
              ) : null}
              <p className="text-center text-[11px] leading-4 text-(--pf-lit-amber-200)/90">{LIVE_SHARE_TEXT.visualOnly}</p>
              <button
                type="button"
                onClick={end}
                className="rounded-md bg-(--pf-lit-red-600) px-3 py-2 text-sm font-medium text-(--pf-lit-white) hover:bg-(--pf-lit-red-500)"
                data-testid="live-share-end"
              >
                {LIVE_SHARE_TEXT.end}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  // A small, non-interactive chip while the sheet is closed: it never blocks the camera or the overlay.
  const badge =
    phase === 'live' && !sheetOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 top-[calc(max(0.5rem,env(safe-area-inset-top))+2.25rem)] z-[1040] flex justify-center [body[data-infra-pinning]_&]:hidden"
            dir="rtl"
            role="status"
            data-testid="live-share-badge"
          >
            <span className="inline-flex max-w-[92%] items-center gap-1.5 rounded-full bg-(--pf-lit-black)/60 px-2.5 py-1 text-[11px] text-(--pf-lit-white) backdrop-blur">
              <span className="size-2 shrink-0 rounded-full bg-(--pf-lit-red-500)" aria-hidden />
              <span className="truncate">
                {liveBadgeText(viewerJoined, viewerLeft)}
                {liveBadgeExtras(controlOn, tripod)}
              </span>
            </span>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <BarButton
        icon={<Cast className="size-5" />}
        label={OVERLAY_TEXT.shareShort}
        description={phase === 'live' ? LIVE_SHARE_TEXT.title : LIVE_SHARE_TEXT.share}
        active={phase === 'live'}
        busy={phase === 'starting'}
        onClick={onButton}
        testId="live-share-button"
      />
      {phase === 'live' ? (
        <BarButton
          icon={<Hand className="size-5" />}
          label={LIVE_SHARE_TEXT.controlBar}
          description={controlOn ? LIVE_SHARE_TEXT.controlBarOn : LIVE_SHARE_TEXT.controlBarOff}
          active={controlOn}
          busy={controlBusy}
          onClick={() => void changeControl(!controlOn)}
          testId="live-share-control-button"
        />
      ) : null}
      {errorNotice}
      {badge}
      {sheet}
    </>
  );
}
